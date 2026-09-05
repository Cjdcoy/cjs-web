import {
  FPS_VALUES,
  PLAYER_LEADERBOARDS,
  type DifficultyData,
  type Fps,
  type GameMap,
  type GameServer,
  type LeaderboardEntry,
  type Player,
  type PlayerActivitySummary,
  type PlayerLeaderboard,
  type PlayerLeaderboardPosition,
  type PlayerJumpScores,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type RankLeaderboardEntry,
  type ReplayWatchAggregate,
  type ReplayWatchRankingEntry,
  type ServerPlayer,
  type ServerResponse,
  type SimpleTop,
  type TopRun,
} from "./domain";
import { invalidResponse } from "./errors";

type JsonRecord = Record<string, unknown>;
type WireStruct = JsonRecord | unknown[];

export function normalizeServerResponse(value: unknown, path: string): ServerResponse {
  const object = wireStruct(value, path, "$response", 3);
  const servers = array(field(object, "servers", 0), path, "servers").map((server, index) =>
    normalizeServer(server, path, `servers[${index}]`),
  );

  return {
    servers,
    total_players:
      optionalNumber(object, "total_players", path, 1) ??
      servers.reduce((total, server) => total + server.player_count, 0),
    online_servers:
      optionalNumber(object, "online_servers", path, 2) ??
      servers.filter((server) => server.online).length,
  };
}

export function normalizeMaps(value: unknown, path: string): GameMap[] {
  return array(value, path, "$response").map((map, index) =>
    normalizeMap(map, path, `$response[${index}]`),
  );
}

export function normalizePlayers(value: unknown, path: string): Player[] {
  return array(value, path, "$response").map((player, index) =>
    normalizePlayer(player, path, `$response[${index}]`),
  );
}

export function normalizeLeaderboard(value: unknown, path: string): LeaderboardEntry[] {
  return array(value, path, "$response").map((entry, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(entry, path, at, 11);
    const playerName =
      optionalString(object, "player_name", path, 1) ?? optionalString(object, "playername", path);
    if (!playerName) throw invalidResponse(path, `${at}.player_name`);

    return {
      player_id: requiredNumber(object, "player_id", path, at, 0),
      player_name: playerName,
      playername: optionalString(object, "playername", path),
      rank: requiredNumber(object, "rank", path, at, 2),
      rating: optionalNumber(object, "rating", path, 3),
      score: optionalNumber(object, "score", path, 8),
      points: optionalNumber(object, "points", path),
      xp: optionalNumber(object, "xp", path),
      country: optionalString(object, "country", path, 4),
      country_code: optionalString(object, "country_code", path, 5),
      region: optionalString(object, "region", path, 6),
      last_seen: optionalString(object, "last_seen", path, 7),
      top_list: optionalNumberRecord(object, "top_list", path, 9),
    } satisfies LeaderboardEntry;
  });
}

export function normalizeTopRuns(value: unknown, path: string): TopRun[] {
  return array(value, path, "$response").map((run, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(run, path, at, 19);
    return {
      rank: requiredNumber(object, "rank", path, at, 1),
      player_id: requiredNumber(object, "player_id", path, at, 3),
      playername: requiredString(object, "playername", path, at, 4),
      player_name: optionalString(object, "player_name", path),
      time: optionalNumber(object, "time", path),
      time_played: requiredNumber(object, "time_played", path, at, 10),
      fps: fps(field(object, "fps", 16), path, `${at}.fps`),
      score: requiredNumber(object, "score", path, at, 18),
      mapname: requiredString(object, "mapname", path, at, 5),
      cpid: requiredNumber(object, "cpid", path, at, 6),
      totalNr: optionalNumber(object, "totalNr", path, 2),
      time_played_string: optionalString(object, "time_played_string", path, 9),
      load_count: optionalNumber(object, "load_count", path, 11),
      save_count: optionalNumber(object, "save_count", path, 12),
      nade_throws: optionalNumber(object, "nade_throws", path, 13),
      nadejumps: optionalNumber(object, "nadejumps", path, 8),
      run_id: optionalNumber(object, "run_id", path, 15),
      type: optionalString(object, "type", path, 17),
      ender: nullableString(object, "ender", path, 7),
      time_created: optionalString(object, "time_created", path, 14),
    };
  });
}

export function normalizePlayerMapRuns(value: unknown, path: string): TopRun[] {
  return value === null ? [] : normalizeTopRuns(value, path);
}

export function normalizePlayerPerformance(value: unknown, path: string): PlayerPerformanceStats {
  const object = wireStruct(value, path, "$response", 16);
  const bestRank = nullableNumber(object, "best_rank", path, 2);
  const averageRank = nullableNumber(object, "average_rank", path, 5);
  const recentValue = field(object, "recent_tops", 6);
  const recent =
    recentValue === undefined || recentValue === null
      ? []
      : array(recentValue, path, "recent_tops").map((top, index) =>
          normalizeSimpleTop(top, path, `recent_tops[${index}]`),
        );
  const oldestValue = field(object, "oldest_top", 7);
  const oldest =
    oldestValue === undefined || oldestValue === null
      ? null
      : normalizeSimpleTop(oldestValue, path, "oldest_top");
  const rankValue = field(object, "rank", 15);
  const rank =
    rankValue === undefined || rankValue === null
      ? undefined
      : normalizePlayerRankAt(rankValue, path, "rank");

  return {
    total_maps_completed: optionalNumber(object, "total_maps_completed", path, 0) ?? 0,
    maps_completed_ratio: optionalNumber(object, "maps_completed_ratio", path, 1) ?? 0,
    best_rank: bestRank !== null && bestRank > 0 ? bestRank : null,
    top10_count: optionalNumber(object, "top10_count", path, 3) ?? 0,
    top1_count: optionalNumber(object, "top1_count", path, 4) ?? 0,
    average_rank: averageRank !== null && averageRank > 0 ? averageRank : null,
    recent_tops: recent,
    oldest_top: oldest,
    days_since_last_seen: nullableNumber(object, "days_since_last_seen", path, 8),
    activity_level: optionalString(object, "activity_level", path, 9) ?? "unknown",
    is_donator: optionalBoolean(object, "is_donator", path, 10) ?? false,
    is_banned: optionalBoolean(object, "is_banned", path, 11) ?? false,
    admin_level: optionalNumber(object, "admin_level", path, 12) ?? 0,
    nb_tops_per_fps: optionalFpsNumberRecord(object, "nb_tops_per_fps", path, 13),
    best_fps:
      field(object, "best_fps", 14) === undefined ||
      field(object, "best_fps", 14) === null ||
      (typeof field(object, "best_fps", 14) === "string" &&
        String(field(object, "best_fps", 14)).trim() === "")
        ? null
        : fps(field(object, "best_fps", 14), path, "best_fps"),
    ...(rank ? { rank } : {}),
  };
}

export function normalizePlayerPositions(
  value: unknown,
  path: string,
): PlayerLeaderboardPosition[] {
  if (value === null) return [];

  return array(value, path, "$response").map((position, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(position, path, at, 10);
    return {
      player_name: requiredString(object, "player_name", path, at, 5),
      rank: requiredNumber(object, "rank", path, at, 2),
      rating: requiredNumber(object, "rating", path, at, 4),
      score: requiredNumber(object, "score", path, at, 3),
      fps: fps(field(object, "fps", 1), path, `${at}.fps`),
      leaderboard_type: playerLeaderboard(
        field(object, "leaderboard_type", 0),
        path,
        `${at}.leaderboard_type`,
      ),
      country: optionalString(object, "country", path, 6),
      country_code: optionalString(object, "country_code", path, 7),
      region: optionalString(object, "region", path, 8),
      last_seen: optionalString(object, "last_seen", path, 9),
    };
  });
}

export function normalizePlayerJumpScores(value: unknown, path: string): PlayerJumpScores {
  const object = wireStruct(value, path, "$response", 11);
  const mapScoresValue = field(object, "map_scores", 10);
  const mapScores =
    mapScoresValue === undefined || mapScoresValue === null
      ? []
      : array(mapScoresValue, path, "$response.map_scores");

  return {
    player_id: requiredNumber(object, "player_id", path, "$response", 0),
    player_name: requiredString(object, "player_name", path, "$response", 1),
    rank: requiredNumber(object, "rank", path, "$response", 2),
    rating: requiredNumber(object, "rating", path, "$response", 3),
    score: requiredNumber(object, "score", path, "$response", 8),
    country: optionalString(object, "country", path, 4),
    country_code: optionalString(object, "country_code", path, 5),
    region: optionalString(object, "region", path, 6),
    last_seen: optionalString(object, "last_seen", path, 7),
    top_list: optionalNumberRecord(object, "top_list", path, 9) ?? {},
    map_scores: mapScores.map((entry, index) => {
      const at = `$response.map_scores[${index}]`;
      const score = wireStruct(entry, path, at, 5);
      return {
        map_id: requiredNumber(score, "map_id", path, at, 0),
        map_name: requiredString(score, "map_name", path, at, 1),
        score: requiredNumber(score, "score", path, at, 2),
        difficulty: requiredNumber(score, "difficulty", path, at, 3),
        rank: requiredNumber(score, "rank", path, at, 4),
      };
    }),
  };
}

export function normalizePlayerRoutes(value: unknown, path: string): PlayerRouteCompletion[] {
  return array(value, path, "$response").map((route, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(route, path, at, 7);
    return {
      map_id: requiredNumber(object, "map_id", path, at, 4),
      map_name: requiredString(object, "map_name", path, at, 2),
      player_id: requiredNumber(object, "player_id", path, at, 0),
      player_name: requiredString(object, "player_name", path, at, 1),
      ender: requiredString(object, "ender", path, at, 3),
      fps_list: array(field(object, "fps_list", 5), path, `${at}.fps_list`).map((value, fpsIndex) =>
        fps(value, path, `${at}.fps_list[${fpsIndex}]`),
      ),
      total_finishes: requiredNumber(object, "total_finishes", path, at, 6),
    };
  });
}

export function normalizePlayerRank(value: unknown, path: string): PlayerRankInfo {
  return normalizePlayerRankAt(value, path, "$response");
}

export function normalizeRankLeaderboard(value: unknown, path: string): RankLeaderboardEntry[] {
  return array(value, path, "$response").map((entry, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(entry, path, at, 2);
    const rankInfo = field(object, "player_rank_info", 1) ?? object;
    return {
      ...normalizePlayerRankAt(rankInfo, path, at),
      rank: requiredNumber(object, "rank", path, at, 0),
    };
  });
}

export function normalizePlayerActivity(value: unknown, path: string): PlayerActivitySummary {
  return normalizePlayerActivityAt(value, path, "$response");
}

export function normalizeReplayWatchAggregate(value: unknown, path: string): ReplayWatchAggregate {
  const object = wireStruct(value, path, "$response", 9);
  const ownerPlayerId = optionalNumber(object, "owner_player_id", path, 0);
  const mapId = optionalNumber(object, "mapid", path, 1);

  return {
    ...(ownerPlayerId === undefined ? {} : { owner_player_id: ownerPlayerId }),
    ...(mapId === undefined ? {} : { mapid: mapId }),
    replay_count: requiredNumber(object, "replay_count", path, "$response", 2),
    watch_count: requiredNumber(object, "watch_count", path, "$response", 3),
    unique_viewer_count: requiredNumber(object, "unique_viewer_count", path, "$response", 4),
    total_watch_ms: requiredNumber(object, "total_watch_ms", path, "$response", 5),
    first_watched_at: nullableString(object, "first_watched_at", path, 6),
    last_watched_at: nullableString(object, "last_watched_at", path, 7),
    updated_at: nullableString(object, "updated_at", path, 8),
  };
}

export function normalizeReplayWatchRankings(
  value: unknown,
  path: string,
): ReplayWatchRankingEntry[] {
  return array(value, path, "$response").map((entry, index) => {
    const at = `$response[${index}]`;
    const object = wireStruct(entry, path, at, 6);
    const summary = wireStruct(field(object, "replay_watch_summary", 5) ?? object, path, at, 9);
    return {
      rank: requiredNumber(object, "rank", path, at, 0),
      run_id: requiredNumber(summary, "run_id", path, at, 0),
      fps: nullableFps(field(object, "fps", 1), path, `${at}.fps`),
      mapid: requiredNumber(summary, "mapid", path, at, 1),
      owner_player_id: requiredNumber(summary, "owner_player_id", path, at, 2),
      mapname: nullableString(object, "mapname", path, 2),
      owner_playername: nullableString(object, "owner_playername", path, 3),
      country: nullableString(object, "country", path, 4),
      watch_count: requiredNumber(summary, "watch_count", path, at, 3),
      unique_viewer_count: requiredNumber(summary, "unique_viewer_count", path, at, 4),
      total_watch_ms: requiredNumber(summary, "total_watch_ms", path, at, 5),
      first_watched_at: nullableString(summary, "first_watched_at", path, 6),
      last_watched_at: nullableString(summary, "last_watched_at", path, 7),
      updated_at: nullableString(summary, "updated_at", path, 8),
    };
  });
}

function normalizeServer(value: unknown, path: string, at: string): GameServer {
  const object = wireStruct(value, path, at, 10);
  const playersValue = field(object, "players", 6);
  const players =
    playersValue === undefined || playersValue === null
      ? null
      : array(playersValue, path, `${at}.players`).map((player, index) =>
          normalizeServerPlayer(player, path, `${at}.players[${index}]`),
        );
  return {
    domain: requiredString(object, "domain", path, at, 0),
    ip: requiredString(object, "ip", path, at, 1),
    port: requiredNumber(object, "port", path, at, 2),
    map: requiredString(object, "map", path, at, 3),
    mapid: requiredNumber(object, "mapid", path, at, 4),
    game_type: requiredString(object, "game_type", path, at, 5),
    players,
    player_count: optionalNumber(object, "player_count", path, 7) ?? players?.length ?? 0,
    online: optionalBoolean(object, "online", path, 8) ?? false,
  };
}

function normalizeServerPlayer(value: unknown, path: string, at: string): ServerPlayer {
  const object = wireStruct(value, path, at, 4);
  return {
    playername: requiredString(object, "playername", path, at, 0),
    playerid: requiredNumber(object, "playerid", path, at, 1),
    ping: optionalNumber(object, "ping", path, 2) ?? 0,
    admin: optionalNumber(object, "admin", path, 3) ?? 0,
  };
}

function normalizeMap(value: unknown, path: string, at: string): GameMap {
  const object = wireStruct(value, path, at, 12);
  const mapId = field(object, "mapid", 0) ?? field(object, "map_id");
  const checkpointId = field(object, "cp_id", 2) ?? mapId;
  return {
    mapid: requiredNumberValue(mapId, path, `${at}.mapid`),
    mapname: requiredString(object, "mapname", path, at, 1),
    cp_id: requiredNumberValue(checkpointId, path, `${at}.cp_id`),
    ender: nullableStringOrNumber(object, "ender", path, 3),
    author: nullableString(object, "author", path, 4),
    released: nullableString(object, "released", path, 5),
    type: nullableString(object, "type", path, 7),
    difficulty: optionalDifficulty(object, "difficulty", path, 9),
    individual_finish_count: optionalNumber(object, "individual_finish_count", path, 10),
    video: nullableString(object, "video", path),
  };
}

function normalizePlayer(value: unknown, path: string, at: string): Player {
  const object = wireStruct(value, path, at, 21);
  const activityValue = field(object, "activity_summary", 20);
  const activity =
    activityValue === undefined || activityValue === null
      ? undefined
      : normalizePlayerActivityAt(activityValue, path, `${at}.activity_summary`);
  return {
    player_id: requiredNumber(object, "player_id", path, at, 0),
    playername: requiredString(object, "playername", path, at, 1),
    pref_name: optionalString(object, "pref_name", path, 9),
    last_seen: optionalString(object, "last_seen", path, 2),
    banned: optionalNumber(object, "banned", path, 3),
    admin: optionalNumber(object, "admin", path, 4),
    admin_speedrun: optionalNumber(object, "admin_speedrun", path, 5),
    admin_emelie: optionalNumber(object, "admin_emelie", path, 6),
    xp: optionalNumber(object, "xp", path, 7),
    xp_speedrun: optionalNumber(object, "xp_speedrun", path, 8),
    visits: optionalNumber(object, "visits", path, 11),
    donated: optionalNumber(object, "donated", path, 16),
    country: optionalString(object, "country", path, 18),
    mapvote_pin: optionalString(object, "mapvote_pin", path, 19),
    ...(activity ? { activity_summary: activity } : {}),
  };
}

function normalizeSimpleTop(value: unknown, path: string, at: string): SimpleTop {
  const object = wireStruct(value, path, at, 6);
  return {
    cpid: requiredNumber(object, "cpid", path, at, 5),
    finish_date: requiredString(object, "finish_date", path, at, 3),
    fps: fps(field(object, "fps", 1), path, `${at}.fps`),
    map_name: requiredString(object, "map_name", path, at, 0),
    rank: requiredNumber(object, "rank", path, at, 2),
    runid: requiredNumber(object, "runid", path, at, 4),
  };
}

function normalizePlayerRankAt(value: unknown, path: string, at: string): PlayerRankInfo {
  const object = wireStruct(value, path, at, 15);
  return {
    player_id: requiredNumber(object, "player_id", path, at, 0),
    player_name: requiredString(object, "player_name", path, at, 1),
    total_xp: requiredNumber(object, "total_xp", path, at, 2),
    prestige: requiredNumber(object, "prestige", path, at, 3),
    level: requiredNumber(object, "level", path, at, 4),
    level_display: requiredString(object, "level_display", path, at, 5),
    title: requiredString(object, "title", path, at, 6),
    xp_into_level: requiredNumber(object, "xp_into_level", path, at, 7),
    xp_for_level: requiredNumber(object, "xp_for_level", path, at, 8),
    xp_to_next: requiredNumber(object, "xp_to_next", path, at, 9),
    maxed: requiredBoolean(object, "maxed", path, at, 10),
    country: optionalString(object, "country", path, 11) || undefined,
    country_code: optionalString(object, "country_code", path, 12) || undefined,
    region: optionalString(object, "region", path, 13) || undefined,
    last_seen: optionalString(object, "last_seen", path, 14) ?? "",
  };
}

function normalizePlayerActivityAt(
  value: unknown,
  path: string,
  at: string,
): PlayerActivitySummary {
  const object = wireStruct(value, path, at, 17);
  return {
    player_id: requiredNumber(object, "player_id", path, at, 0),
    run_attempt_ms: requiredNumber(object, "run_attempt_ms", path, at, 1),
    runtime_ms: requiredNumber(object, "runtime_ms", path, at, 8),
    playing_ms: requiredNumber(object, "playing_ms", path, at, 9),
    spectating_ms: requiredNumber(object, "spectating_ms", path, at, 10),
    afk_ms: requiredNumber(object, "afk_ms", path, at, 11),
    playing_afk_ms: requiredNumber(object, "playing_afk_ms", path, at, 12),
    spectating_afk_ms: requiredNumber(object, "spectating_afk_ms", path, at, 13),
    load_count: requiredNumber(object, "load_count", path, at, 2),
    save_count: requiredNumber(object, "save_count", path, at, 3),
    jump_count: requiredNumber(object, "jump_count", path, at, 4),
    nadethrows: requiredNumber(object, "nadethrows", path, at, 5),
    nadejumps: requiredNumber(object, "nadejumps", path, at, 6),
    distance_travelled: requiredNumber(object, "distance_travelled", path, at, 7),
    first_activity_at: nullableString(object, "first_activity_at", path, 14),
    last_activity_at: nullableString(object, "last_activity_at", path, 15),
    updated_at: requiredString(object, "updated_at", path, at, 16),
  };
}

function record(value: unknown, path: string, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(path, field);
  }
  return value as JsonRecord;
}

function wireStruct(
  value: unknown,
  path: string,
  fieldName: string,
  minimumTupleLength: number,
): WireStruct {
  if (Array.isArray(value)) {
    if (value.length < minimumTupleLength) throw invalidResponse(path, fieldName);
    return value;
  }
  return record(value, path, fieldName);
}

function array(value: unknown, path: string, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse(path, field);
  return value;
}

function field(object: WireStruct, key: string, nativeIndex?: number): unknown {
  return Array.isArray(object) ? object[nativeIndex ?? -1] : object[key];
}

function requiredString(
  object: WireStruct,
  key: string,
  path: string,
  at: string,
  nativeIndex?: number,
): string {
  const value = field(object, key, nativeIndex);
  if (typeof value !== "string") throw invalidResponse(path, `${at}.${key}`);
  return value;
}

function optionalString(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): string | undefined {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidResponse(path, key);
  return value;
}

function nullableString(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): string | null {
  return optionalString(object, key, path, nativeIndex) ?? null;
}

function requiredNumber(
  object: WireStruct,
  key: string,
  path: string,
  at: string,
  nativeIndex?: number,
): number {
  return requiredNumberValue(field(object, key, nativeIndex), path, `${at}.${key}`);
}

function requiredNumberValue(value: unknown, path: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidResponse(path, field);
  return value;
}

function optionalNumber(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): number | undefined {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidResponse(path, key);
  return value;
}

function nullableNumber(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): number | null {
  return optionalNumber(object, key, path, nativeIndex) ?? null;
}

function requiredBoolean(
  object: WireStruct,
  key: string,
  path: string,
  at: string,
  nativeIndex?: number,
): boolean {
  const value = field(object, key, nativeIndex);
  if (typeof value !== "boolean") throw invalidResponse(path, `${at}.${key}`);
  return value;
}

function optionalBoolean(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): boolean | undefined {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalidResponse(path, key);
  return value;
}

function nullableStringOrNumber(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): string | number | null {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw invalidResponse(path, key);
  }
  return value;
}

function fps(value: unknown, path: string, field: string): Fps {
  if (typeof value === "string" && FPS_VALUES.some((candidate) => candidate === value)) {
    return value as Fps;
  }
  throw invalidResponse(path, field);
}

function nullableFps(value: unknown, path: string, field: string): Fps | null {
  return value === undefined || value === null ? null : fps(value, path, field);
}

function playerLeaderboard(value: unknown, path: string, field: string): PlayerLeaderboard {
  if (typeof value === "string" && PLAYER_LEADERBOARDS.some((candidate) => candidate === value)) {
    return value as PlayerLeaderboard;
  }
  throw invalidResponse(path, field);
}

function optionalNumberRecord(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): Record<string, number> | undefined {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return undefined;
  const values = record(value, path, key);
  const normalized: Record<string, number> = {};
  for (const [entryKey, entryValue] of Object.entries(values)) {
    normalized[entryKey] = requiredNumberValue(entryValue, path, `${key}.${entryKey}`);
  }
  return normalized;
}

function optionalFpsNumberRecord(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): Partial<Record<Fps, number>> {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return {};
  const values = record(value, path, key);
  const normalized: Partial<Record<Fps, number>> = {};
  for (const candidate of FPS_VALUES) {
    const count = values[candidate];
    if (count !== undefined) {
      normalized[candidate] = requiredNumberValue(count, path, `${key}.${candidate}`);
    }
  }
  return normalized;
}

function optionalDifficulty(
  object: WireStruct,
  key: string,
  path: string,
  nativeIndex?: number,
): Record<string, DifficultyData> | null {
  const value = field(object, key, nativeIndex);
  if (value === undefined || value === null) return null;
  const values = record(value, path, key);
  const normalized: Record<string, DifficultyData> = {};
  for (const [fpsKey, difficulty] of Object.entries(values)) {
    const entry = wireStruct(difficulty, path, `${key}.${fpsKey}`, 11);
    normalized[fpsKey] = {
      difficulty: requiredNumber(entry, "difficulty", path, `${key}.${fpsKey}`, 1),
      nb_tops: requiredNumber(entry, "nb_tops", path, `${key}.${fpsKey}`, 10),
    };
  }
  return normalized;
}
