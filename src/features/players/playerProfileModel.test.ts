import { describe, expect, it } from "vitest";
import type {
  PlayerLeaderboardPosition,
  PlayerPerformanceStats,
  PlayerRankInfo,
  PlayerRouteCompletion,
  TopRun,
} from "../../lib/api";
import {
  createPlayerProfileIdentity,
  formatDuration,
  formatRunTime,
  hasProfileIdentity,
  playerBoardLabel,
} from "./playerProfileModel";

describe("createPlayerProfileIdentity", () => {
  it("prefers rank identity and falls back across partial profile responses", () => {
    const identity = createPlayerProfileIdentity(42, {
      performance: performance({ rank }),
      positions: [position({ player_name: "Position name" })],
      rank,
      routes: [route({ player_name: "Route name" })],
      scores: null,
    });

    expect(identity).toEqual({
      country: "Testland",
      countryCode: "TL",
      lastSeen: "2026-08-01T00:00:00Z",
      name: "^2Runner^7One",
      playerId: 42,
      region: "EU",
    });
    expect(hasProfileIdentity(identity)).toBe(true);
  });

  it("keeps a stable player-number fallback when every identity endpoint is empty", () => {
    const identity = createPlayerProfileIdentity(42, {
      performance: performance(),
      positions: [],
      rank: null,
      routes: [],
      scores: null,
    });

    expect(identity.name).toBe("Player #42");
    expect(hasProfileIdentity(identity)).toBe(false);
  });
});

describe("player profile formatting", () => {
  it("formats activity durations without implying unavailable precision", () => {
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(90_000)).toBe("1m");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });

  it("prefers the API's formatted run time", () => {
    expect(formatRunTime(topRun({ time_played_string: "00:12.345" }))).toBe("00:12.345");
  });

  it("labels every supported player leaderboard", () => {
    expect(
      ["speed", "jump", "defrag", "surf", "howmany"].map((board) =>
        playerBoardLabel(board as Parameters<typeof playerBoardLabel>[0]),
      ),
    ).toEqual(["Speed skill", "Jump skill", "Defrag skill", "Surf skill", "Map completion"]);
  });
});

const rank: PlayerRankInfo = {
  country: "Testland",
  country_code: "TL",
  last_seen: "2026-08-01T00:00:00Z",
  level: 8,
  level_display: "8",
  maxed: false,
  player_id: 42,
  player_name: "^2Runner^7One",
  prestige: 1,
  region: "EU",
  title: "Jumper",
  total_xp: 12_000,
  xp_for_level: 2_000,
  xp_into_level: 500,
  xp_to_next: 1_500,
};

function performance(overrides: Partial<PlayerPerformanceStats> = {}): PlayerPerformanceStats {
  return {
    activity_level: "Active",
    admin_level: 0,
    average_rank: 4.5,
    best_fps: "125",
    best_rank: 1,
    days_since_last_seen: 2,
    is_banned: false,
    is_donator: false,
    maps_completed_ratio: 0.5,
    nb_tops_per_fps: { "125": 2 },
    oldest_top: null,
    recent_tops: [],
    top10_count: 5,
    top1_count: 1,
    total_maps_completed: 20,
    ...overrides,
  };
}

function position(overrides: Partial<PlayerLeaderboardPosition> = {}): PlayerLeaderboardPosition {
  return {
    fps: "125",
    leaderboard_type: "speed",
    player_name: "Runner",
    rank: 3,
    rating: 42,
    score: 900,
    ...overrides,
  };
}

function route(overrides: Partial<PlayerRouteCompletion> = {}): PlayerRouteCompletion {
  return {
    ender: "finish",
    fps_list: ["125"],
    map_id: 9,
    map_name: "mp_route",
    player_id: 42,
    player_name: "Runner",
    total_finishes: 2,
    ...overrides,
  };
}

function topRun(overrides: Partial<TopRun> = {}): TopRun {
  return {
    cpid: 91,
    fps: "125",
    mapname: "mp_run",
    player_id: 42,
    playername: "Runner",
    rank: 1,
    score: 100,
    time_played: 12_345,
    ...overrides,
  };
}
