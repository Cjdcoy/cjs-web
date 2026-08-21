import { mockApi } from "./fixtures/api";
import { expect, test } from "./fixtures/test";

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
