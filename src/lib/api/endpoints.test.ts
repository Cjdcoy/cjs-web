import { describe, expect, it, vi } from "vitest";

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
  replayWatchAggregateFixture,
  replayWatchRankingsFixture,
  topRunsFixture,
  trackerServersFixture,
} from "./__fixtures__/responses";
import { createJsonClient } from "./client";
import { createCjsApi } from "./endpoints";
import { UnsupportedCapabilityError } from "./errors";

describe("typed CJS API endpoints", () => {
  it("builds and normalizes every MVP endpoint", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.toString());
      return Response.json(responseFor(url.pathname));
    });
    const api = createCjsApi(
      createJsonClient({
        baseUrl: "https://example.test/proxy",
        fetch: fetchMock as typeof fetch,
        maxRetries: 0,
      }),
    );

    await expect(api.trackerServers({ source: "jh" })).resolves.toMatchObject({
      total_players: 1,
    });
    await expect(
      api.leaderboard({ source: "jh", kind: "speed-skill", fps: "125" }),
    ).resolves.toHaveLength(1);
    await expect(api.rankXpLeaderboard({ source: "j4l", limit: 2 })).resolves.toHaveLength(1);
    await expect(api.maps({ source: "jh" })).resolves.toHaveLength(1);
    await expect(
      api.mapTops({ source: "jh", checkpointId: "route / 1", fps: "125", limit: 2 }),
    ).resolves.toHaveLength(1);
    await expect(api.players({ source: "jh", sort: "last-seen" })).resolves.toHaveLength(1);
    await expect(
      api.searchPlayers({ source: "jh", name: "^1 Runner / ?", limit: 2 }),
    ).resolves.toHaveLength(1);
    await expect(api.playerPerformance({ source: "jh", playerId: 501 })).resolves.toMatchObject({
      best_rank: 1,
    });
    await expect(
      api.playerLeaderboardPositions({
        source: "jh",
        playerId: 501,
        fps: "125",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      api.playerJumpScores({ source: "jh", playerId: 501, fps: "125" }),
    ).resolves.toMatchObject({
      map_scores: expect.arrayContaining([expect.objectContaining({ score: 1536 })]),
    });
    await expect(
      api.playerTops({ source: "jh", playerId: 501, fps: "125", limit: 2 }),
    ).resolves.toHaveLength(1);
    await expect(
      api.playerMapRuns({ source: "jh", playerId: 501, checkpointId: 901, fps: "125" }),
    ).resolves.toHaveLength(1);
    await expect(api.playerRoutes({ source: "jh", playerId: 501 })).resolves.toHaveLength(1);
    await expect(api.playerRank({ source: "j4l", playerId: 501 })).resolves.toMatchObject({
      level: 12,
    });
    await expect(
      api.playerActivitySummary({ source: "j4l", playerId: 501 }),
    ).resolves.toMatchObject({ jump_count: 2400 });
    await expect(
      api.replayWatchAggregate({ source: "j4l", ownerPlayerId: 501 }),
    ).resolves.toMatchObject({ replay_count: 2, watch_count: 18 });
    await expect(
      api.replayWatchRankings({
        source: "j4l",
        mapId: 101,
        metric: "watch_count",
        limit: 5,
        offset: 0,
      }),
    ).resolves.toHaveLength(1);

    expect(urls).toEqual([
      "https://example.test/proxy/api/v1/tracker/servers?source=jh",
      "https://example.test/proxy/api/v1/leaderboard/speed-skill?source=jh&fps=125",
      "https://example.test/proxy/api/v1/leaderboard/rank-xp?source=j4l&limit=2",
      "https://example.test/proxy/api/v1/map/all?source=jh",
      "https://example.test/proxy/api/v1/map/tops?source=jh&fps=125&cpid=route+%2F+1&limit=2",
      "https://example.test/proxy/api/v1/player/all?source=jh&sort=last-seen",
      "https://example.test/proxy/api/v1/player/id-from-name?source=jh&name=%5E1+Runner+%2F+%3F&limit=2",
      "https://example.test/proxy/api/v1/player/performance-stats?source=jh&playerid=501",
      "https://example.test/proxy/api/v1/player/leaderboard-positions?source=jh&playerid=501&fps=125",
      "https://example.test/proxy/api/v1/player/jump-scores?source=jh&playerid=501&fps=125",
      "https://example.test/proxy/api/v1/player/tops?source=jh&playerid=501&fps=125&limit=2",
      "https://example.test/proxy/api/v1/player/map-runs?source=jh&playerid=501&cpid=901&fps=125",
      "https://example.test/proxy/api/v1/player/routes-completion?source=jh&playerid=501",
      "https://example.test/proxy/api/v1/player/rank?source=j4l&playerid=501",
      "https://example.test/proxy/api/v1/player/activity-summary?source=j4l&playerid=501",
      "https://example.test/proxy/api/v1/replay/watch-aggregate?source=j4l&owner_playerid=501",
      "https://example.test/proxy/api/v1/replay/watch-rankings?source=j4l&metric=watch_count&mapid=101&limit=5&offset=0",
    ]);
  });

  it("composes owner and map replay filters in one request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(replayWatchRankingsFixture));
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await api.replayWatchRankings({
      source: "j4l",
      ownerPlayerId: 501,
      mapId: 101,
      metric: "unique_viewer_count",
      limit: 10,
      offset: 20,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/v1/replay/watch-rankings?source=j4l&metric=unique_viewer_count&owner_playerid=501&mapid=101&limit=10&offset=20",
    );
  });

  it("requests global replay watch rankings without an owner or map filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(replayWatchRankingsFixture));
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await api.replayWatchRankings({
      source: "j4l",
      metric: "last_watched_at",
      limit: 25,
      offset: 0,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/v1/replay/watch-rankings?source=j4l&metric=last_watched_at&limit=25&offset=0",
    );
  });

  it("rejects replay responses that do not match the requested scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...(replayWatchAggregateFixture as Record<string, unknown>),
          mapid: 999,
        }),
      )
      .mockResolvedValueOnce(Response.json(replayWatchRankingsFixture));
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await expect(api.replayWatchAggregate({ source: "j4l", mapId: 101 })).rejects.toMatchObject({
      kind: "invalid-response",
    });
    await expect(
      api.replayWatchRankings({
        source: "j4l",
        mapId: 999,
        metric: "watch_count",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("omits FPS for the howmany leaderboard because the API does not support it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(leaderboardFixture));
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await api.leaderboard({ source: "jh", kind: "howmany", fps: "125" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/v1/leaderboard/howmany?source=jh",
    );
  });

  it("rejects J4L-only capabilities before fetch", async () => {
    const fetchMock = vi.fn();
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await expect(api.playerRank({ source: "jh", playerId: 501 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(api.playerActivitySummary({ source: "jh", playerId: 501 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(api.rankXpLeaderboard({ source: "jh" })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(
      api.replayWatchAggregate({ source: "jh", ownerPlayerId: 501 }),
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError);
    await expect(
      api.replayWatchRankings({ source: "jh", metric: "watch_count" }),
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input before fetch", async () => {
    const fetchMock = vi.fn();
    const api = createCjsApi(
      createJsonClient({ baseUrl: "https://example.test", fetch: fetchMock as typeof fetch }),
    );

    await expect(api.searchPlayers({ source: "jh", name: "   " })).rejects.toMatchObject({
      kind: "invalid-argument",
    });
    await expect(api.playerTops({ source: "jh", playerId: -1, fps: "125" })).rejects.toMatchObject({
      kind: "invalid-argument",
    });
    await expect(
      api.playerMapRuns({ source: "jh", playerId: 501, checkpointId: "", fps: "125" }),
    ).rejects.toMatchObject({ kind: "invalid-argument" });
    await expect(
      api.replayWatchAggregate({ source: "j4l", ownerPlayerId: 0 }),
    ).rejects.toMatchObject({ kind: "invalid-argument" });
    await expect(
      // @ts-expect-error The runtime boundary must also reject untyped aggregate callers without a scope.
      api.replayWatchAggregate({ source: "j4l" }),
    ).rejects.toMatchObject({ kind: "invalid-argument" });
    await expect(
      api.replayWatchRankings({
        source: "j4l",
        mapId: -1,
        metric: "watch_count",
      }),
    ).rejects.toMatchObject({ kind: "invalid-argument" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function responseFor(pathname: string): unknown {
  if (pathname.endsWith("/tracker/servers")) return trackerServersFixture;
  if (pathname.endsWith("/leaderboard/rank-xp")) return rankLeaderboardFixture;
  if (pathname.includes("/leaderboard/")) return leaderboardFixture;
  if (pathname.endsWith("/map/all")) return mapsFixture;
  if (pathname.endsWith("/map/tops")) return topRunsFixture;
  if (pathname.endsWith("/player/all") || pathname.endsWith("/player/id-from-name")) {
    return playersFixture;
  }
  if (pathname.endsWith("/player/performance-stats")) return playerPerformanceFixture;
  if (pathname.endsWith("/player/leaderboard-positions")) return playerPositionsFixture;
  if (pathname.endsWith("/player/jump-scores")) return playerJumpScoresFixture;
  if (pathname.endsWith("/player/tops")) return topRunsFixture;
  if (pathname.endsWith("/player/map-runs")) return topRunsFixture;
  if (pathname.endsWith("/player/routes-completion")) return playerRoutesFixture;
  if (pathname.endsWith("/player/rank")) return playerRankFixture;
  if (pathname.endsWith("/player/activity-summary")) return playerActivityFixture;
  if (pathname.endsWith("/replay/watch-aggregate")) return replayWatchAggregateFixture;
  if (pathname.endsWith("/replay/watch-rankings")) return replayWatchRankingsFixture;
  throw new Error(`Unhandled fixture path: ${pathname}`);
}
