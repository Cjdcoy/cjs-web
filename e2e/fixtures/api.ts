import type { Page } from "@playwright/test";
import {
  leaderboardFixture,
  mapsFixture,
  playerActivityFixture,
  playerJumpScoresFixture,
  playerPerformanceFixture,
  playerPositionsFixture,
  playerRankFixture,
  playerRoutesFixture,
  playersFixture,
  rankLeaderboardFixture,
  topRunsFixture,
  trackerServersFixture,
} from "../../src/lib/api/__fixtures__/responses";

interface ApiMockOptions {
  readonly delayMs?: number;
  readonly delayPath?: string;
  readonly failurePath?: string;
  readonly failureStatus?: number;
}

const responses: Readonly<Record<string, unknown>> = {
  "/api/v1/tracker/servers": trackerServersFixture,
  "/api/v1/leaderboard/speed-skill": leaderboardFixture,
  "/api/v1/leaderboard/jump-skill": leaderboardFixture,
  "/api/v1/leaderboard/defrag-skill": leaderboardFixture,
  "/api/v1/leaderboard/surf-skill": leaderboardFixture,
  "/api/v1/leaderboard/howmany": leaderboardFixture,
  "/api/v1/leaderboard/rank-xp": rankLeaderboardFixture,
  "/api/v1/map/all": mapsFixture,
  "/api/v1/map/tops": topRunsFixture,
  "/api/v1/player/all": playersFixture,
  "/api/v1/player/id-from-name": playersFixture,
  "/api/v1/player/performance-stats": playerPerformanceFixture,
  "/api/v1/player/leaderboard-positions": playerPositionsFixture,
  "/api/v1/player/jump-scores": playerJumpScoresFixture,
  // The profile joins personal bests to jump-scores by map, so this run scores map 101.
  "/api/v1/player/tops": (topRunsFixture as readonly Record<string, unknown>[]).map((run) => ({
    ...run,
    cpid: 101,
  })),
  "/api/v1/player/routes-completion": playerRoutesFixture,
  "/api/v1/player/rank": playerRankFixture,
  "/api/v1/player/activity-summary": playerActivityFixture,
};

const expectedQueries: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>> = {
  "/api/v1/tracker/servers": [{ source: "jh" }, { source: "j4l" }],
  "/api/v1/leaderboard/speed-skill": [{ source: "jh", fps: "125" }],
  "/api/v1/leaderboard/jump-skill": [{ source: "jh", fps: "125" }],
  "/api/v1/leaderboard/defrag-skill": [{ source: "jh", fps: "125" }],
  "/api/v1/leaderboard/surf-skill": [{ source: "jh", fps: "125" }],
  "/api/v1/leaderboard/howmany": [{ source: "jh" }],
  "/api/v1/leaderboard/rank-xp": [{ source: "j4l" }],
  "/api/v1/map/all": [{ source: "jh" }],
  "/api/v1/map/tops": [{ source: "jh", fps: "125", cpid: "901", limit: "100" }],
  "/api/v1/player/all": [{ source: "jh", sort: "last-seen" }],
  "/api/v1/player/id-from-name": [{ source: "jh", name: "Runner", limit: "50" }],
  "/api/v1/player/performance-stats": [{ source: "jh", playerid: "501" }],
  "/api/v1/player/leaderboard-positions": [{ source: "jh", playerid: "501", fps: "125" }],
  "/api/v1/player/jump-scores": [{ source: "jh", playerid: "501", fps: "125" }],
  "/api/v1/player/tops": [{ source: "jh", playerid: "501", fps: "125", limit: "1000" }],
  "/api/v1/player/routes-completion": [{ source: "jh", playerid: "501" }],
  "/api/v1/player/rank": [{ source: "j4l", playerid: "501" }],
  "/api/v1/player/activity-summary": [{ source: "j4l", playerid: "501" }],
};

function matchesExpectedQuery(
  searchParams: URLSearchParams,
  expectation: Readonly<Record<string, string>>,
): boolean {
  const actualEntries = [...searchParams.entries()];
  const expectedEntries = Object.entries(expectation);
  return (
    actualEntries.length === expectedEntries.length &&
    expectedEntries.every(([name, value]) => searchParams.get(name) === value)
  );
}

export async function mockApi(page: Page, options: ApiMockOptions = {}): Promise<void> {
  await page.route("**/__api/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/__api/, "");

    if (request.method() !== "GET") {
      await route.fulfill({
        status: 405,
        json: { error: `Unexpected ${request.method()} request for ${path}` },
      });
      return;
    }

    if (!(path in responses)) {
      await route.fulfill({
        status: 500,
        json: { error: `No browser-test fixture registered for ${path}` },
      });
      return;
    }

    const queryIsExpected = (expectedQueries[path] ?? []).some((expectation) =>
      matchesExpectedQuery(url.searchParams, expectation),
    );
    if (!queryIsExpected) {
      await route.fulfill({
        status: 500,
        json: { error: `Unexpected query for ${path}: ${url.searchParams.toString()}` },
      });
      return;
    }

    if (path === options.delayPath && options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (path === options.failurePath) {
      await route.fulfill({
        status: options.failureStatus ?? 400,
        json: { error: "Synthetic browser-test failure" },
      });
      return;
    }

    await route.fulfill({ status: 200, json: responses[path] });
  });
}
