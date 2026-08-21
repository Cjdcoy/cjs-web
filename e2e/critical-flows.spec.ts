import AxeBuilder from "@axe-core/playwright";
import { mockApi } from "./fixtures/api";
import { allowBrowserError, expect, test } from "./fixtures/test";

test("live servers and leaderboards render stable public data", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Live servers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
  await expect(page.getByRole("link", { name: "mp_cjs_training" })).toHaveAttribute(
    "href",
    "/maps/101?source=jh",
  );
  await page.getByRole("checkbox", { name: "Auto-refresh" }).uncheck();

  await page.goto("/leaderboards");
  await expect(page.getByRole("heading", { level: 1, name: "Leaderboards" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Runner" })).toHaveAttribute(
    "href",
    "/players/501?source=jh",
  );
});

test("map discovery, detail, and browser-local favorites work as one flow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/maps");

  const mapLink = page.getByRole("link", { name: "mp_cjs_training", exact: true });
  await expect(mapLink).toBeVisible();
  await page.getByRole("button", { name: "Add mp_cjs_training to favorites" }).click();
  await expect(
    page.getByRole("button", { name: "Remove mp_cjs_training from favorites" }),
  ).toHaveAttribute("aria-pressed", "true");

  await mapLink.click();
  await expect(page).toHaveURL(/\/maps\/101\?source=jh$/);
  await expect(page.getByRole("heading", { level: 1, name: "mp_cjs_training" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Runner" })).toBeVisible();

  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your favorites" })).toBeVisible();
  await expect(page.getByRole("link", { name: "mp_cjs_training" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "mp_cjs_training" })).toBeVisible();
  await page.getByRole("button", { name: "Remove mp_cjs_training from favorites" }).click();
  await expect(page.getByRole("heading", { name: "No favorite maps yet" })).toBeVisible();
  await expect(page.getByText("mp_cjs_training removed from favorites.")).toBeAttached();
  await expect(page.getByRole("link", { name: "Browse maps" })).toBeFocused();
});

test("player discovery, profile, and favorites work as one flow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/players?q=Runner");

  const playerLink = page.getByRole("link", { name: /Runner.*501/i });
  await expect(playerLink).toBeVisible();
  await page.getByRole("button", { name: "Add Runner to favorites" }).click();
  await playerLink.click();

  await expect(page).toHaveURL(/\/players\/501\?source=jh$/);
  await expect(page.getByRole("heading", { level: 1, name: "Runner" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Performance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "mp_cjs_training" }).first()).toBeVisible();

  await page.goto("/favorites?tab=players");
  await expect(page.getByRole("link", { name: "Runner" })).toBeVisible();
  await page.getByRole("button", { name: "Clear players" }).click();
  await expect(page.getByRole("heading", { name: "No favorite players yet" })).toBeVisible();
  await expect(page.getByText("1 favorite player removed.")).toBeAttached();
  await expect(page.getByRole("link", { name: "Search players" })).toBeFocused();
});

test("slow and failed network states remain understandable and recoverable", async ({ page }) => {
  await mockApi(page, {
    delayMs: 600,
    delayPath: "/api/v1/tracker/servers",
  });
  await page.goto("/");

  await expect(page.getByText("Loading live server data.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await mockApi(page, {
    failurePath: "/api/v1/tracker/servers",
    failureStatus: 400,
  });
  allowBrowserError(page, /Failed to load resource: the server responded with a status of 400/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Live servers are unavailable" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry server feed" });
  await expect(retry).toBeEnabled();

  await page.unrouteAll({ behavior: "wait" });
  await mockApi(page);
  await retry.click();
  await expect(page.getByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
});

test("direct nested routes survive refresh and critical views pass WCAG axe rules", async ({
  page,
}) => {
  await mockApi(page);
  const routes = [
    { path: "/", heading: "Live servers" },
    { path: "/leaderboards", heading: "Leaderboards" },
    { path: "/maps", heading: "Find your next route" },
    { path: "/maps/101", heading: "mp_cjs_training" },
    { path: "/players?q=Runner", heading: "Find a player" },
    { path: "/players/501", heading: "Runner" },
    { path: "/favorites", heading: "Your favorites" },
  ] as const;

  for (const route of routes) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `axe violations at ${route.path}`).toEqual([]);
    });
  }

  await page.goto("/maps/101?source=jh");
  await expect(page.getByRole("heading", { level: 1, name: "mp_cjs_training" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "mp_cjs_training" })).toBeVisible();

  await page.goto("/players/501?source=jh");
  await expect(page.getByRole("heading", { level: 1, name: "Runner" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Runner" })).toBeVisible();
});
