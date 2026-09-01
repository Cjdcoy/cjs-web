// These payloads preserve the documented/live response shapes while using only
// fictional names, reserved documentation addresses, and synthetic identifiers.

export const trackerServersFixture: unknown = {
  servers: [
    {
      domain: "cod2.example.invalid",
      ip: "203.0.113.10",
      port: 28960,
      map: "mp_cjs_training",
      mapid: 101,
      game_type: "jump",
      players: [{ playername: "^2Runner", playerid: 501, ping: 42, admin: 0 }],
      player_count: 1,
      online: true,
    },
  ],
  total_players: 1,
  online_servers: 1,
};

export const mapsFixture: unknown = [
  {
    mapid: 101,
    mapname: "mp_cjs_training",
    cp_id: 901,
    ender: null,
    author: "Mapper",
    released: "2026-01-02T03:04:05Z",
    type: "jump",
    difficulty: {
      "125": { difficulty: 3, nb_tops: 12 },
      "333": { difficulty: 4, nb_tops: 6 },
    },
    individual_finish_count: 18,
    video: null,
  },
];

const playerResponse = {
  player_id: 501,
  playername: "^2Runner",
  pref_name: "Runner",
  last_seen: "2026-01-02T03:04:05Z",
  banned: 0,
  admin: 0,
  admin_speedrun: 0,
  admin_emelie: 0,
  xp: 1200,
  xp_speedrun: 350,
  visits: 24,
  donated: 0,
  country: "Exampleland",
  mapvote_pin: "0000",
};

export const playersFixture: unknown = [playerResponse];

export const leaderboardFixture: unknown = [
  {
    player_id: 501,
    player_name: "^2Runner",
    rank: 1,
    rating: 812.5,
    score: 320,
    country: "Exampleland",
    country_code: "XX",
    region: "Other",
    last_seen: "2026-01-02T03:04:05Z",
    top_list: { top1: 4, top10: 12 },
  },
];

export const topRunsFixture: unknown = [
  {
    rank: 1,
    player_id: 501,
    playername: "^2Runner",
    mapname: "mp_cjs_training",
    cpid: 901,
    time_played: 12_345,
    run_id: 7001,
    fps: "125",
    type: "jump",
    score: 100,
    totalNr: 5,
    time_played_string: "00:12.345",
    load_count: 0,
    save_count: 0,
    nade_throws: 1,
    nadejumps: 1,
    ender: null,
    time_created: "2026-01-02T03:04:05Z",
  },
];

export const replayWatchAggregateFixture: unknown = {
  owner_player_id: 501,
  replay_count: 2,
  watch_count: 18,
  unique_viewer_count: 11,
  total_watch_ms: 420_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

export const replayWatchRankingsFixture: unknown = [
  {
    rank: 1,
    run_id: 7001,
    fps: "125",
    mapid: 101,
    owner_player_id: 501,
    mapname: "mp_cjs_training",
    owner_playername: "^2Runner",
    country: "Exampleland",
    watch_count: 12,
    unique_viewer_count: 8,
    total_watch_ms: 300_000,
    first_watched_at: "2026-07-01T10:00:00Z",
    last_watched_at: "2026-08-01T11:00:00Z",
    updated_at: "2026-08-01T11:05:00Z",
  },
];

export const playerPerformanceFixture: unknown = {
  total_maps_completed: 18,
  maps_completed_ratio: 0.75,
  best_rank: 1,
  top10_count: 12,
  top1_count: 4,
  average_rank: 5.5,
  recent_tops: [
    {
      cpid: 901,
      finish_date: "2026-01-02T03:04:05Z",
      fps: "125",
      map_name: "mp_cjs_training",
      rank: 1,
      runid: 7001,
    },
  ],
  oldest_top: {
    cpid: 801,
    finish_date: "2025-01-02T03:04:05Z",
    fps: "333",
    map_name: "mp_cjs_beginner",
    rank: 8,
    runid: 6001,
  },
  days_since_last_seen: 2,
  activity_level: "active",
  is_donator: false,
  is_banned: false,
  admin_level: 0,
  nb_tops_per_fps: { "125": 12, "333": 6 },
  best_fps: "125",
};

export const playerPositionsFixture: unknown = [
  {
    player_name: "^2Runner",
    rank: 1,
    rating: 812.5,
    score: 320,
    fps: "125",
    leaderboard_type: "speed",
    country: "Exampleland",
    country_code: "XX",
    region: "Other",
    last_seen: "2026-01-02T03:04:05Z",
  },
];

export const playerJumpScoresFixture: unknown = {
  player_id: 501,
  player_name: "^2Runner",
  rank: 4,
  rating: 812.5,
  score: 2_740,
  country: "Exampleland",
  country_code: "XX",
  region: "Other",
  last_seen: "2026-01-02T03:04:05Z",
  top_list: { "1": 2, "2": 1 },
  map_scores: [
    {
      map_id: 101,
      map_name: "mp_cjs_training",
      score: 1_536,
      difficulty: 9.7588,
      rank: 1,
    },
    {
      map_id: 102,
      map_name: "mp_cjs_advanced",
      score: 1_204,
      difficulty: 8.411,
      rank: 2,
    },
  ],
};

export const playerRoutesFixture: unknown = [
  {
    map_id: 101,
    map_name: "mp_cjs_training",
    player_id: 501,
    player_name: "^2Runner",
    ender: "main",
    fps_list: ["125", "333"],
    total_finishes: 3,
  },
];

const playerRankResponse = {
  player_id: 501,
  player_name: "^2Runner",
  total_xp: 1200,
  prestige: 1,
  level: 12,
  level_display: "12",
  title: "Pathfinder",
  xp_into_level: 200,
  xp_for_level: 500,
  xp_to_next: 300,
  maxed: false,
  country: "Exampleland",
  country_code: "XX",
  region: "Other",
  last_seen: "2026-01-02T03:04:05Z",
};

export const playerRankFixture: unknown = playerRankResponse;

export const rankLeaderboardFixture: unknown = [{ ...playerRankResponse, rank: 1 }];

const playerActivityResponse = {
  player_id: 501,
  run_attempt_ms: 600_000,
  runtime_ms: 480_000,
  playing_ms: 900_000,
  spectating_ms: 120_000,
  afk_ms: 30_000,
  playing_afk_ms: 20_000,
  spectating_afk_ms: 10_000,
  load_count: 8,
  save_count: 3,
  jump_count: 2400,
  nadethrows: 18,
  nadejumps: 12,
  distance_travelled: 98_765,
  first_activity_at: "2026-01-01T00:00:00Z",
  last_activity_at: "2026-01-02T03:04:05Z",
  updated_at: "2026-01-02T03:05:00Z",
};

export const playerActivityFixture: unknown = playerActivityResponse;

export const j4lPlayersFixture: unknown = [
  {
    ...playerResponse,
    activity_summary: {
      ...playerActivityResponse,
      first_activity_at: null,
      last_activity_at: null,
    },
  },
];
