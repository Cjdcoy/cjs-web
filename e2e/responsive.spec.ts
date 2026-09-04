import type { Locator, Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { expect, test } from "./fixtures/test";
import {
  playerActivityFixture,
  playerPerformanceFixture,
  replayWatchAggregateFixture,
  replayWatchRankingsFixture,
  playerPositionsFixture,
  playerRankFixture,
  playersFixture,
} from "../src/lib/api/__fixtures__/responses";

const j4lProfileResponses: Readonly<Record<string, unknown>> = {
  "/api/v1/player/activity-summary": playerActivityFixture,
  "/api/v1/player/all": playersFixture,
  "/api/v1/player/leaderboard-positions": playerPositionsFixture,
  "/api/v1/player/performance-stats": playerPerformanceFixture,
  "/api/v1/player/rank": playerRankFixture,
  "/api/v1/replay/watch-aggregate": replayWatchAggregateFixture,
  "/api/v1/replay/watch-rankings": replayWatchRankingsFixture,
};

test.use({
  viewport: { width: 320, height: 800 },
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("critical pages reflow without horizontal page overflow at 320px", async ({ page }) => {
  await mockApi(page);
  const routes = [
    { path: "/", heading: "Live servers" },
    { path: "/leaderboards", heading: "Leaderboards" },
    { path: "/maps", heading: "Find your next route" },
    { path: "/maps/101", heading: "mp_cjs_training" },
    { path: "/players?q=Runner", heading: "Find a player" },
    { path: "/players/501", heading: "Runner" },
    { path: "/favorites", heading: "Your favorites" },
    { path: "/about", heading: "Jump statistics, clearly sourced." },
  ] as const;

  for (const route of routes) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth, `horizontal overflow at ${route.path}`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    });
  }
});

test("mobile navigation and visible leaderboard sorting work with the keyboard", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/leaderboards");
  await expect(page.getByRole("link", { name: "Runner" })).toBeVisible();

  const sort = page.getByRole("combobox", { name: "Sort leaderboard" });
  await expect(sort).toBeVisible();
  await sort.focus();
  await page.keyboard.press("End");
  await expect(sort).toHaveValue("value");

  await page.getByRole("button", { name: "Open navigation" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Maps" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Find your next route" })).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByText("Maps page loaded.")).toBeAttached();
});

test("reduced-motion preference disables loading shimmer animation", async ({ page }) => {
  await mockApi(page, {
    delayMs: 600,
    delayPath: "/api/v1/map/all",
  });
  await page.goto("/maps");

  const skeleton = page.locator(".cjs-skeleton").first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("link", { name: "mp_cjs_training", exact: true })).toBeVisible();
});

test("best runs expose jump-skill points without mobile or desktop overflow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/players/501?source=jh&view=runs&fps=125");

  await expect(page.getByRole("heading", { level: 2, name: "Best runs" })).toBeVisible();
  await expect(page.getByText("Total skill points")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Skill points" })).toBeAttached();
  await expect(page.getByRole("cell", { name: "1,536" })).toBeVisible();

  for (const viewport of [
    { width: 320, height: 800 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }
});

test("J4L lifetime activity leads the overview and keeps metric values below labels", async ({
  page,
}) => {
  await page.route("**/__api/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/__api/, "");
    const response = j4lProfileResponses[path];
    await route.fulfill(
      response
        ? { status: 200, json: response }
        : { status: 500, json: { error: `Missing J4L profile fixture for ${path}` } },
    );
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/players/501?source=j4l");

  const overview = page.locator(".cjs-player-profile__overview-grid");
  const lifetimeActivity = page.locator(".cjs-player-profile__section--activity");
  const metricCards = lifetimeActivity.locator(".cjs-player-profile__activity-grid > div");
  const recentActivity = page.locator(".cjs-player-profile__overview-column--recent");
  await expect(page.getByRole("heading", { level: 2, name: "Time on Jump4Life" })).toBeVisible();
  await expect(lifetimeActivity.locator(".cjs-player-profile__time-split-bar")).toBeVisible();
  await expect(
    lifetimeActivity.locator(".cjs-player-profile__activity-highlights > div"),
  ).toHaveCount(4);
  await lifetimeActivity.getByText("All tracking totals").click();
  await expect(metricCards).toHaveCount(9);
  expect(await horizontalPositions(metricCards)).toHaveLength(5);
  expect(await valuesFollowLabels(metricCards)).toBe(true);
  expect((await recentActivity.boundingBox())?.width).toBeGreaterThan(300);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "/tmp/cjs-j4l-activity-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(overview).toBeVisible();
  expect(await horizontalPositions(metricCards)).toHaveLength(2);
  expect(await valuesFollowLabels(metricCards)).toBe(true);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "/tmp/cjs-j4l-activity-mobile.png", fullPage: true });
});

async function horizontalPositions(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((cards) => [
    ...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))),
  ]);
}

async function valuesFollowLabels(locator: Locator): Promise<boolean> {
  return locator.evaluateAll((cards) =>
    cards.every((card) => {
      const label = card.querySelector("dt")?.getBoundingClientRect();
      const value = card.querySelector("dd")?.getBoundingClientRect();
      return Boolean(label && value && value.top >= label.bottom);
    }),
  );
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
