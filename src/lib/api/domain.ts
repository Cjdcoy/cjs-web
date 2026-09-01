export const SOURCES = ["jh", "j4l"] as const;
export type Source = (typeof SOURCES)[number];

export const GAMES = ["cod2"] as const;
export type Game = (typeof GAMES)[number];

export const FPS_VALUES = ["43", "76", "125", "250", "333", "0"] as const;
export type Fps = (typeof FPS_VALUES)[number];

export const LEADERBOARD_KINDS = [
  "speed-skill",
  "jump-skill",
  "defrag-skill",
  "surf-skill",
  "howmany",
] as const;
export type LeaderboardKind = (typeof LEADERBOARD_KINDS)[number];

export const PLAYER_LEADERBOARDS = ["speed", "jump", "defrag", "surf", "howmany"] as const;
export type PlayerLeaderboard = (typeof PLAYER_LEADERBOARDS)[number];

export type PlayerSort = "last-seen" | "visits";

export const REPLAY_WATCH_METRICS = [
  "watch_count",
  "unique_viewer_count",
  "total_watch_ms",
  "last_watched_at",
] as const;
export type ReplayWatchMetric = (typeof REPLAY_WATCH_METRICS)[number];

export type ReplayWatchScope =
  { ownerPlayerId: number; mapId?: number } | { mapId: number; ownerPlayerId?: number };

export interface ReplayWatchFilters {
  ownerPlayerId?: number;
  mapId?: number;
}

export interface ReplayWatchAggregate {
  owner_player_id?: number;
  mapid?: number;
  replay_count: number;
  watch_count: number;
  unique_viewer_count: number;
  total_watch_ms: number;
  first_watched_at: string | null;
  last_watched_at: string | null;
  updated_at: string | null;
}

export interface ReplayWatchRankingEntry {
  rank: number;
  run_id: number;
  fps: Fps | null;
  mapid: number;
  owner_player_id: number;
  mapname: string | null;
  owner_playername: string | null;
  country: string | null;
  watch_count: number;
  unique_viewer_count: number;
  total_watch_ms: number;
  first_watched_at: string | null;
  last_watched_at: string | null;
  updated_at: string | null;
}

export interface ServerPlayer {
  playername: string;
  playerid: number;
  ping: number;
  admin: number;
}

export interface GameServer {
  domain: string;
  ip: string;
  port: number;
  map: string;
  mapid: number;
  game_type: string;
  players: ServerPlayer[] | null;
  player_count: number;
  online: boolean;
}

export interface ServerResponse {
  servers: GameServer[];
  total_players: number;
  online_servers: number;
}

export interface DifficultyData {
  difficulty: number;
  nb_tops: number;
}

export interface GameMap {
  mapid: number;
  mapname: string;
  cp_id: number;
  ender?: number | string | null;
  author?: string | null;
  released?: string | null;
  type?: string | null;
  difficulty?: Record<string, DifficultyData> | null;
  individual_finish_count?: number;
  video?: string | null;
}

export interface PlayerActivitySummary {
  player_id: number;
  run_attempt_ms: number;
  runtime_ms: number;
  playing_ms: number;
  spectating_ms: number;
  afk_ms: number;
  playing_afk_ms: number;
  spectating_afk_ms: number;
  load_count: number;
  save_count: number;
  jump_count: number;
  nadethrows: number;
  nadejumps: number;
  distance_travelled: number;
  first_activity_at: string | null;
  last_activity_at: string | null;
  updated_at: string;
}

export interface Player {
  player_id: number;
  playername: string;
  pref_name?: string;
  last_seen?: string;
  banned?: number;
  admin?: number;
  admin_speedrun?: number;
  admin_emelie?: number;
  xp?: number;
  xp_speedrun?: number;
  visits?: number;
  donated?: number;
  country?: string;
  mapvote_pin?: string;
  activity_summary?: PlayerActivitySummary;
}

export interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  playername?: string;
  rank: number;
  rating?: number;
  score?: number;
  points?: number;
  xp?: number;
  country?: string;
  country_code?: string;
  region?: string;
  last_seen?: string;
  top_list?: Record<string, number>;
  [key: string]: unknown;
}

export interface TopRun {
  rank: number;
  player_id: number;
  playername: string;
  player_name?: string;
  time?: number;
  time_played: number;
  fps: Fps;
  score: number;
  mapname: string;
  cpid: number;
  totalNr?: number;
  time_played_string?: string;
  load_count?: number;
  save_count?: number;
  nade_throws?: number;
  nadejumps?: number;
  run_id?: number;
  type?: string;
  ender?: string | null;
  time_created?: string;
}

export interface SimpleTop {
  cpid: number;
  finish_date: string;
  fps: Fps;
  map_name: string;
  rank: number;
  runid: number;
}

export interface PlayerRankInfo {
  player_id: number;
  player_name: string;
  total_xp: number;
  prestige: number;
  level: number;
  level_display: string;
  title: string;
  xp_into_level: number;
  xp_for_level: number;
  xp_to_next: number;
  maxed: boolean;
  country?: string;
  country_code?: string;
  region?: string;
  last_seen: string;
}

export interface RankLeaderboardEntry extends PlayerRankInfo {
  rank: number;
}

export interface PlayerPerformanceStats {
  total_maps_completed: number;
  maps_completed_ratio: number;
  best_rank: number | null;
  top10_count: number;
  top1_count: number;
  average_rank: number | null;
  recent_tops: SimpleTop[];
  oldest_top: SimpleTop | null;
  days_since_last_seen: number | null;
  activity_level: string;
  is_donator: boolean;
  is_banned: boolean;
  admin_level: number;
  nb_tops_per_fps: Partial<Record<Fps, number>>;
  best_fps: Fps | null;
  rank?: PlayerRankInfo;
}

export interface PlayerLeaderboardPosition {
  player_name: string;
  rank: number;
  rating: number;
  score: number;
  fps: Fps;
  leaderboard_type: PlayerLeaderboard;
  country?: string;
  country_code?: string;
  region?: string;
  last_seen?: string;
}

export interface PlayerMapScore {
  map_id: number;
  map_name: string;
  score: number;
  difficulty: number;
  rank: number;
}

export interface PlayerJumpScores {
  player_id: number;
  player_name: string;
  rank: number;
  rating: number;
  score: number;
  country?: string;
  country_code?: string;
  region?: string;
  last_seen?: string;
  top_list: Record<string, number>;
  map_scores: PlayerMapScore[];
}

export interface PlayerRouteCompletion {
  map_id: number;
  map_name: string;
  player_id: number;
  player_name: string;
  ender: string;
  fps_list: Fps[];
  total_finishes: number;
}
