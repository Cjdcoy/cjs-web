import { describe, expect, it } from "vitest";

import {
  j4lPlayersFixture,
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
import {
  normalizeLeaderboard,
  normalizeMaps,
  normalizePlayerActivity,
  normalizePlayerJumpScores,
  normalizePlayerMapRuns,
  normalizePlayerPerformance,
  normalizePlayerPositions,
  normalizePlayerRank,
  normalizePlayerRoutes,
  normalizePlayers,
  normalizeRankLeaderboard,
  normalizeReplayWatchAggregate,
  normalizeReplayWatchRankings,
  normalizeServerResponse,
  normalizeTopRuns,
} from "./normalizers";

const path = "/api/v1/fixture";

describe("API response normalizers", () => {
  it("normalizes tracker servers and computes omitted totals", () => {
    const fixture = trackerServersFixture as {
      servers: unknown[];
    };
    const normalized = normalizeServerResponse({ servers: fixture.servers }, path);
    expect(normalized).toMatchObject({ total_players: 1, online_servers: 1 });
    expect(normalized.servers[0]?.players?.[0]).toEqual({
      playername: "^2Runner",
      playerid: 501,
      ping: 42,
      admin: 0,
    });
  });

  it("normalizes maps and the OpenAPI map_id fallback", () => {
    expect(normalizeMaps(mapsFixture, path)[0]).toMatchObject({
      mapid: 101,
      cp_id: 901,
      difficulty: { "125": { difficulty: 3, nb_tops: 12 } },
    });
    expect(normalizeMaps([{ map_id: 7, mapname: "mp_fallback" }], path)[0]).toMatchObject({
      mapid: 7,
      cp_id: 7,
    });
  });

  it("normalizes JH and J4L player list variants", () => {
    expect(normalizePlayers(playersFixture, path)[0]).toMatchObject({
      player_id: 501,
      playername: "^2Runner",
    });
    expect(normalizePlayers(j4lPlayersFixture, path)[0]?.activity_summary).toMatchObject({
      player_id: 501,
      jump_count: 2400,
      first_activity_at: null,
      last_activity_at: null,
    });
  });

  it("normalizes leaderboard and rank-XP entries", () => {
    expect(normalizeLeaderboard(leaderboardFixture, path)[0]).toMatchObject({
      player_name: "^2Runner",
      rank: 1,
      rating: 812.5,
    });
    expect(normalizeRankLeaderboard(rankLeaderboardFixture, path)[0]).toMatchObject({
      player_name: "^2Runner",
      rank: 1,
      total_xp: 1200,
    });
  });

  it("normalizes top runs", () => {
    expect(normalizeTopRuns(topRunsFixture, path)[0]).toMatchObject({
      player_id: 501,
      cpid: 901,
      fps: "125",
      time_played: 12_345,
    });
  });

  it("normalizes player map history and its documented empty sentinel", () => {
    expect(normalizePlayerMapRuns(topRunsFixture, path)).toHaveLength(1);
    expect(normalizePlayerMapRuns(null, path)).toEqual([]);
  });

  it("normalizes performance and supplies safe defaults for optional data", () => {
    expect(normalizePlayerPerformance(playerPerformanceFixture, path)).toMatchObject({
      total_maps_completed: 18,
      best_fps: "125",
      recent_tops: [{ map_name: "mp_cjs_training", rank: 1 }],
    });
    expect(normalizePlayerPerformance({}, path)).toEqual({
      total_maps_completed: 0,
      maps_completed_ratio: 0,
      best_rank: null,
      top10_count: 0,
      top1_count: 0,
      average_rank: null,
      recent_tops: [],
      oldest_top: null,
      days_since_last_seen: null,
      activity_level: "unknown",
      is_donator: false,
      is_banned: false,
      admin_level: 0,
      nb_tops_per_fps: {},
      best_fps: null,
    });

    expect(
      normalizePlayerPerformance(
        {
          average_rank: 0,
          best_fps: "",
          best_rank: 0,
          recent_tops: [],
          total_maps_completed: 3,
        },
        path,
      ),
    ).toMatchObject({
      average_rank: null,
      best_fps: null,
      best_rank: null,
      recent_tops: [],
      total_maps_completed: 3,
    });
  });

  it("normalizes player positions and completed routes", () => {
    expect(normalizePlayerPositions(playerPositionsFixture, path)[0]).toMatchObject({
      leaderboard_type: "speed",
      fps: "125",
      rank: 1,
    });
    expect(normalizePlayerRoutes(playerRoutesFixture, path)[0]).toMatchObject({
      map_id: 101,
      fps_list: ["125", "333"],
      total_finishes: 3,
    });
  });

  it("normalizes a successful null player position response as no placement", () => {
    expect(normalizePlayerPositions(null, path)).toEqual([]);
  });

  it("normalizes player jump-skill map scores", () => {
    expect(normalizePlayerJumpScores(playerJumpScoresFixture, path)).toMatchObject({
      player_id: 501,
      rank: 4,
      score: 2740,
      map_scores: expect.arrayContaining([
        {
          map_id: 101,
          map_name: "mp_cjs_training",
          score: 1536,
          difficulty: 9.7588,
          rank: 1,
        },
      ]),
    });

    expect(
      normalizePlayerJumpScores(
        {
          player_id: 143872,
          player_name: "",
          rank: 0,
          rating: 0,
          score: 0,
          top_list: {},
        },
        path,
      ),
    ).toMatchObject({
      map_scores: [],
      player_id: 143872,
      rank: 0,
      score: 0,
    });
  });

  it("normalizes J4L rank and activity summaries", () => {
    expect(normalizePlayerRank(playerRankFixture, path)).toMatchObject({
      level: 12,
      title: "Pathfinder",
    });
    expect(normalizePlayerActivity(playerActivityFixture, path)).toMatchObject({
      runtime_ms: 480_000,
      distance_travelled: 98_765,
    });
  });

  it("normalizes replay aggregates and per-run rankings", () => {
    expect(normalizeReplayWatchAggregate(replayWatchAggregateFixture, path)).toMatchObject({
      owner_player_id: 501,
      replay_count: 2,
      unique_viewer_count: 11,
    });
    expect(normalizeReplayWatchRankings(replayWatchRankingsFixture, path)[0]).toMatchObject({
      rank: 1,
      run_id: 7001,
      fps: "125",
      mapname: "mp_cjs_training",
      watch_count: 12,
    });
    expect(
      normalizeReplayWatchAggregate(
        {
          replay_count: 0,
          watch_count: 0,
          unique_viewer_count: 0,
          total_watch_ms: 0,
          first_watched_at: null,
          last_watched_at: null,
          updated_at: null,
        },
        path,
      ),
    ).toMatchObject({ updated_at: null });
  });

  it("keeps J4L rank rows when optional country metadata is absent", () => {
    const [rank] = rankLeaderboardFixture as Record<string, unknown>[];
    const [normalized] = normalizeRankLeaderboard(
      [{ ...rank, country: null, country_code: null, region: null }],
      path,
    );

    expect(normalized).toMatchObject({ player_id: 501, level: 12, level_display: "12" });
    expect(normalized).toMatchObject({
      country: undefined,
      country_code: undefined,
      region: undefined,
    });
  });

  it.each([
    ["server list", () => normalizeServerResponse({ servers: "bad" }, path)],
    ["map list", () => normalizeMaps({ mapid: 1 }, path)],
    ["player list", () => normalizePlayers([{ player_id: "bad" }], path)],
    ["leaderboard", () => normalizeLeaderboard([{ player_id: 1 }], path)],
    ["top run", () => normalizeTopRuns([{ rank: 1 }], path)],
    ["performance", () => normalizePlayerPerformance({ top10_count: "many" }, path)],
    ["position", () => normalizePlayerPositions([{ rank: 1 }], path)],
    ["jump scores", () => normalizePlayerJumpScores({ player_id: 1 }, path)],
    ["routes", () => normalizePlayerRoutes([{ map_id: 1 }], path)],
    ["rank", () => normalizePlayerRank({ player_id: 1 }, path)],
    ["activity", () => normalizePlayerActivity({ player_id: 1 }, path)],
    ["replay aggregate", () => normalizeReplayWatchAggregate({ replay_count: "many" }, path)],
    ["replay rankings", () => normalizeReplayWatchRankings([{ rank: 1 }], path)],
  ])("returns a safe structured error for malformed %s payloads", (_label, normalize) => {
    expect(normalize).toThrowError(
      expect.objectContaining({ kind: "invalid-response", path: "/api/v1/fixture" }),
    );
  });
});
