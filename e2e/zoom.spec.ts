import { mockApi } from "./fixtures/api";
import { expect, test } from "./fixtures/test";

test.use({
  deviceScaleFactor: 2,
  viewport: { width: 640, height: 400 },
});

test("critical pages retain content and avoid horizontal overflow at a 200% scale equivalent", async ({
  page,
}) => {
  await mockApi(page);
  const routes = [
    { path: "/", heading: "Live servers" },
    { path: "/leaderboards", heading: "Leaderboards" },
    { path: "/maps", heading: "Browse maps" },
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
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        devicePixelRatio: window.devicePixelRatio,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.devicePixelRatio).toBe(2);
      expect(layout.scrollWidth, `horizontal overflow at ${route.path}`).toBeLessThanOrEqual(
        layout.clientWidth + 1,
      );
    });
  }

  await page.goto("/leaderboards");
  await expect(page.getByRole("combobox", { name: "Sort leaderboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
});
