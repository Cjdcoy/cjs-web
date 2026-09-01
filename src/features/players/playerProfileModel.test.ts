import { describe, expect, it } from "vitest";
import type {
  GameMap,
  Player,
  PlayerLeaderboardPosition,
  PlayerPerformanceStats,
  PlayerRankInfo,
  PlayerRouteCompletion,
  TopRun,
} from "../../lib/api";
import {
  createPlayerProfileIdentity,
  createPlayerRouteInventory,
  filterPlayerRouteInventory,
  formatDuration,
  formatFpsList,
  formatProfilePercent,
  formatRunTime,
  getRunAchievement,
  hasProfileIdentity,
  playerBoardLabel,
  summarizePlayerRouteInventory,
} from "./playerProfileModel";

describe("createPlayerProfileIdentity", () => {
  it("prefers rank identity and falls back across partial profile responses", () => {
    const identity = createPlayerProfileIdentity(42, {
      directory: null,
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
      directory: null,
      performance: performance(),
      positions: [],
      rank: null,
      routes: [],
      scores: null,
    });

    expect(identity.name).toBe("Player #42");
    expect(hasProfileIdentity(identity)).toBe(false);
  });

  it("uses directory identity when profile statistics do not publish it", () => {
    const directory: Player = {
      country: "ES",
      last_seen: "2026-08-30 00:58:54",
      player_id: 141172,
      playername: "REDsherpa",
    };

    expect(
      createPlayerProfileIdentity(141172, {
        directory,
        performance: performance(),
        positions: [],
        rank: null,
        routes: [],
        scores: null,
      }),
    ).toEqual({
      country: "ES",
      countryCode: "ES",
      lastSeen: "2026-08-30 00:58:54",
      name: "REDsherpa",
      playerId: 141172,
      region: null,
    });
  });
});

describe("player profile formatting", () => {
  it("classifies podium and top-10 run achievements", () => {
    expect([1, 2, 3, 4, 10, 11, 0].map(getRunAchievement)).toEqual([
      { label: "First place", tier: "first" },
      { label: "Second place", tier: "second" },
      { label: "Third place", tier: "third" },
      { label: "Top 10", tier: "top-ten" },
      { label: "Top 10", tier: "top-ten" },
      null,
      null,
    ]);
  });

  it("formats activity durations without implying unavailable precision", () => {
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(90_000)).toBe("1m");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });

  it("formats completed FPS values with one shared unit", () => {
    expect(formatFpsList(["43", "125", "250"])).toBe("43, 125, 250 FPS");
    expect(formatFpsList(["0"])).toBe("Mix");
    expect(formatFpsList([])).toBe("Not available");
  });

  it("prefers the API's formatted run time", () => {
    expect(formatRunTime(topRun({ time_played_string: "00:12.345" }))).toBe("00:12.345");
  });

  it("keeps meaningful precision for completion ratios below one percent", () => {
    expect(formatProfilePercent(3 / 634)).toBe("0.47%");
    expect(formatProfilePercent(0.5)).toBe("50%");
    expect(formatProfilePercent(0)).toBe("0%");
  });

  it("labels every supported player leaderboard", () => {
    expect(
      ["speed", "jump", "defrag", "surf", "howmany"].map((board) =>
        playerBoardLabel(board as Parameters<typeof playerBoardLabel>[0]),
      ),
    ).toEqual(["Speed skill", "Jump skill", "Defrag skill", "Surf skill", "Map completion"]);
  });
});

describe("player route inventory", () => {
  const maps: GameMap[] = [
    { cp_id: 101, mapid: 1, mapname: "mp_alpha", type: "jump" },
    { cp_id: 102, ender: "hard", mapid: 2, mapname: "mp_beta", type: "surf" },
  ];

  it("joins completed routes to the full map catalog without losing historical routes", () => {
    const inventory = createPlayerRouteInventory(maps, [
      route({ ender: "", map_id: 1, map_name: "mp_alpha", total_finishes: 3 }),
      route({ map_id: 9, map_name: "mp_archived", total_finishes: 2 }),
    ]);

    expect(inventory).toEqual([
      expect.objectContaining({ completed: true, mapId: 1, mapName: "mp_alpha", published: true }),
      expect.objectContaining({
        completed: true,
        mapId: 9,
        mapName: "mp_archived",
        published: false,
      }),
      expect.objectContaining({
        completed: false,
        ender: "hard",
        mapId: 2,
        mapName: "mp_beta",
        published: true,
      }),
    ]);
    expect(summarizePlayerRouteInventory(inventory)).toEqual({
      archivedCompleted: 1,
      completed: 1,
      completionRate: 1 / 2,
      remaining: 1,
      total: 2,
      totalFinishes: 5,
    });
  });

  it("filters the inventory by completion status and case-insensitive map name", () => {
    const inventory = createPlayerRouteInventory(maps, [
      route({ ender: "", map_id: 1, map_name: "mp_alpha" }),
    ]);

    expect(
      filterPlayerRouteInventory(inventory, { query: "BETA", status: "remaining" }).map(
        (item) => item.mapName,
      ),
    ).toEqual(["mp_beta"]);
    expect(filterPlayerRouteInventory(inventory, { query: "", status: "completed" })).toHaveLength(
      1,
    );
  });

  it("treats each map ender as a distinct route", () => {
    const inventory = createPlayerRouteInventory(
      [
        { cp_id: 201, ender: "Easy", mapid: 3, mapname: "mp_split" },
        { cp_id: 202, ender: "Hard", mapid: 3, mapname: "mp_split" },
      ],
      [route({ ender: "hard", map_id: 3, map_name: "mp_split" })],
    );

    expect(inventory.map(({ completed, routeId }) => ({ completed, routeId }))).toEqual([
      { completed: false, routeId: "3:easy" },
      { completed: true, routeId: "3:hard" },
    ]);
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
