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

export function normalizeServerResponse(value: unknown, path: string): ServerResponse {
  const object = record(value, path, "$response");
  const servers = array(object.servers, path, "servers").map((server, index) =>
    normalizeServer(server, path, `servers[${index}]`),
  );

  return {
    servers,
    total_players:
      optionalNumber(object, "total_players", path) ??
      servers.reduce((total, server) => total + server.player_count, 0),
    online_servers:
      optionalNumber(object, "online_servers", path) ??
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
    const object = record(entry, path, at);
    const playerName =
      optionalString(object, "player_name", path) ?? optionalString(object, "playername", path);
    if (!playerName) throw invalidResponse(path, `${at}.player_name`);

    return {
      player_id: requiredNumber(object, "player_id", path, at),
      player_name: playerName,
      playername: optionalString(object, "playername", path),
      rank: requiredNumber(object, "rank", path, at),
      rating: optionalNumber(object, "rating", path),
      score: optionalNumber(object, "score", path),
      points: optionalNumber(object, "points", path),
      xp: optionalNumber(object, "xp", path),
      country: optionalString(object, "country", path),
      country_code: optionalString(object, "country_code", path),
      region: optionalString(object, "region", path),
      last_seen: optionalString(object, "last_seen", path),
      top_list: optionalNumberRecord(object, "top_list", path),
    } satisfies LeaderboardEntry;
  });
}

export function normalizeTopRuns(value: unknown, path: string): TopRun[] {
  return array(value, path, "$response").map((run, index) => {
    const at = `$response[${index}]`;
    const object = record(run, path, at);
    return {
      rank: requiredNumber(object, "rank", path, at),
      player_id: requiredNumber(object, "player_id", path, at),
      playername: requiredString(object, "playername", path, at),
      player_name: optionalString(object, "player_name", path),
      time: optionalNumber(object, "time", path),
      time_played: requiredNumber(object, "time_played", path, at),
      fps: fps(object.fps, path, `${at}.fps`),
      score: requiredNumber(object, "score", path, at),
      mapname: requiredString(object, "mapname", path, at),
      cpid: requiredNumber(object, "cpid", path, at),
      totalNr: optionalNumber(object, "totalNr", path),
      time_played_string: optionalString(object, "time_played_string", path),
      load_count: optionalNumber(object, "load_count", path),
      save_count: optionalNumber(object, "save_count", path),
      nade_throws: optionalNumber(object, "nade_throws", path),
      nadejumps: optionalNumber(object, "nadejumps", path),
      run_id: optionalNumber(object, "run_id", path),
      type: optionalString(object, "type", path),
      ender: nullableString(object, "ender", path),
      time_created: optionalString(object, "time_created", path),
    };
  });
}

export function normalizePlayerMapRuns(value: unknown, path: string): TopRun[] {
  return value === null ? [] : normalizeTopRuns(value, path);
}

export function normalizePlayerPerformance(value: unknown, path: string): PlayerPerformanceStats {
  const object = record(value, path, "$response");
  const bestRank = nullableNumber(object, "best_rank", path);
  const averageRank = nullableNumber(object, "average_rank", path);
  const recent =
    object.recent_tops === undefined || object.recent_tops === null
      ? []
      : array(object.recent_tops, path, "recent_tops").map((top, index) =>
          normalizeSimpleTop(top, path, `recent_tops[${index}]`),
        );
  const oldest =
    object.oldest_top === undefined || object.oldest_top === null
      ? null
      : normalizeSimpleTop(object.oldest_top, path, "oldest_top");
  const rank =
    object.rank === undefined || object.rank === null
      ? undefined
      : normalizePlayerRankAt(object.rank, path, "rank");

  return {
    total_maps_completed: optionalNumber(object, "total_maps_completed", path) ?? 0,
    maps_completed_ratio: optionalNumber(object, "maps_completed_ratio", path) ?? 0,
    best_rank: bestRank !== null && bestRank > 0 ? bestRank : null,
    top10_count: optionalNumber(object, "top10_count", path) ?? 0,
    top1_count: optionalNumber(object, "top1_count", path) ?? 0,
    average_rank: averageRank !== null && averageRank > 0 ? averageRank : null,
    recent_tops: recent,
    oldest_top: oldest,
    days_since_last_seen: nullableNumber(object, "days_since_last_seen", path),
    activity_level: optionalString(object, "activity_level", path) ?? "unknown",
    is_donator: optionalBoolean(object, "is_donator", path) ?? false,
    is_banned: optionalBoolean(object, "is_banned", path) ?? false,
    admin_level: optionalNumber(object, "admin_level", path) ?? 0,
    nb_tops_per_fps: optionalFpsNumberRecord(object, "nb_tops_per_fps", path),
    best_fps:
      object.best_fps === undefined ||
      object.best_fps === null ||
      (typeof object.best_fps === "string" && object.best_fps.trim() === "")
        ? null
        : fps(object.best_fps, path, "best_fps"),
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
    const object = record(position, path, at);
    return {
      player_name: requiredString(object, "player_name", path, at),
      rank: requiredNumber(object, "rank", path, at),
      rating: requiredNumber(object, "rating", path, at),
      score: requiredNumber(object, "score", path, at),
      fps: fps(object.fps, path, `${at}.fps`),
      leaderboard_type: playerLeaderboard(object.leaderboard_type, path, `${at}.leaderboard_type`),
      country: optionalString(object, "country", path),
      country_code: optionalString(object, "country_code", path),
      region: optionalString(object, "region", path),
      last_seen: optionalString(object, "last_seen", path),
    };
  });
}

export function normalizePlayerJumpScores(value: unknown, path: string): PlayerJumpScores {
  const object = record(value, path, "$response");
  const mapScores =
    object.map_scores === undefined || object.map_scores === null
      ? []
      : array(object.map_scores, path, "$response.map_scores");

  return {
    player_id: requiredNumber(object, "player_id", path, "$response"),
    player_name: requiredString(object, "player_name", path, "$response"),
    rank: requiredNumber(object, "rank", path, "$response"),
    rating: requiredNumber(object, "rating", path, "$response"),
    score: requiredNumber(object, "score", path, "$response"),
    country: optionalString(object, "country", path),
    country_code: optionalString(object, "country_code", path),
    region: optionalString(object, "region", path),
    last_seen: optionalString(object, "last_seen", path),
    top_list: optionalNumberRecord(object, "top_list", path) ?? {},
    map_scores: mapScores.map((entry, index) => {
      const at = `$response.map_scores[${index}]`;
      const score = record(entry, path, at);
      return {
        map_id: requiredNumber(score, "map_id", path, at),
        map_name: requiredString(score, "map_name", path, at),
        score: requiredNumber(score, "score", path, at),
        difficulty: requiredNumber(score, "difficulty", path, at),
        rank: requiredNumber(score, "rank", path, at),
      };
    }),
  };
}

export function normalizePlayerRoutes(value: unknown, path: string): PlayerRouteCompletion[] {
  return array(value, path, "$response").map((route, index) => {
    const at = `$response[${index}]`;
    const object = record(route, path, at);
    return {
      map_id: requiredNumber(object, "map_id", path, at),
      map_name: requiredString(object, "map_name", path, at),
      player_id: requiredNumber(object, "player_id", path, at),
      player_name: requiredString(object, "player_name", path, at),
      ender: requiredString(object, "ender", path, at),
      fps_list: array(object.fps_list, path, `${at}.fps_list`).map((value, fpsIndex) =>
        fps(value, path, `${at}.fps_list[${fpsIndex}]`),
      ),
      total_finishes: requiredNumber(object, "total_finishes", path, at),
    };
  });
}

export function normalizePlayerRank(value: unknown, path: string): PlayerRankInfo {
  return normalizePlayerRankAt(value, path, "$response");
}

export function normalizeRankLeaderboard(value: unknown, path: string): RankLeaderboardEntry[] {
  return array(value, path, "$response").map((entry, index) => {
    const at = `$response[${index}]`;
    const object = record(entry, path, at);
    return {
      ...normalizePlayerRankAt(object, path, at),
      rank: requiredNumber(object, "rank", path, at),
    };
  });
}

export function normalizePlayerActivity(value: unknown, path: string): PlayerActivitySummary {
  return normalizePlayerActivityAt(value, path, "$response");
}

export function normalizeReplayWatchAggregate(value: unknown, path: string): ReplayWatchAggregate {
  const object = record(value, path, "$response");
  const ownerPlayerId = optionalNumber(object, "owner_player_id", path);
  const mapId = optionalNumber(object, "mapid", path);

  return {
    ...(ownerPlayerId === undefined ? {} : { owner_player_id: ownerPlayerId }),
    ...(mapId === undefined ? {} : { mapid: mapId }),
    replay_count: requiredNumber(object, "replay_count", path, "$response"),
    watch_count: requiredNumber(object, "watch_count", path, "$response"),
    unique_viewer_count: requiredNumber(object, "unique_viewer_count", path, "$response"),
    total_watch_ms: requiredNumber(object, "total_watch_ms", path, "$response"),
    first_watched_at: nullableString(object, "first_watched_at", path),
    last_watched_at: nullableString(object, "last_watched_at", path),
    updated_at: nullableString(object, "updated_at", path),
  };
}

export function normalizeReplayWatchRankings(
  value: unknown,
  path: string,
): ReplayWatchRankingEntry[] {
  return array(value, path, "$response").map((entry, index) => {
    const at = `$response[${index}]`;
    const object = record(entry, path, at);
    return {
      rank: requiredNumber(object, "rank", path, at),
      run_id: requiredNumber(object, "run_id", path, at),
      fps: nullableFps(object.fps, path, `${at}.fps`),
      mapid: requiredNumber(object, "mapid", path, at),
      owner_player_id: requiredNumber(object, "owner_player_id", path, at),
      mapname: nullableString(object, "mapname", path),
      owner_playername: nullableString(object, "owner_playername", path),
      country: nullableString(object, "country", path),
      watch_count: requiredNumber(object, "watch_count", path, at),
      unique_viewer_count: requiredNumber(object, "unique_viewer_count", path, at),
      total_watch_ms: requiredNumber(object, "total_watch_ms", path, at),
      first_watched_at: nullableString(object, "first_watched_at", path),
      last_watched_at: nullableString(object, "last_watched_at", path),
      updated_at: nullableString(object, "updated_at", path),
    };
  });
}

function normalizeServer(value: unknown, path: string, at: string): GameServer {
  const object = record(value, path, at);
  const players =
    object.players === undefined || object.players === null
      ? null
      : array(object.players, path, `${at}.players`).map((player, index) =>
          normalizeServerPlayer(player, path, `${at}.players[${index}]`),
        );
  return {
    domain: requiredString(object, "domain", path, at),
    ip: requiredString(object, "ip", path, at),
    port: requiredNumber(object, "port", path, at),
    map: requiredString(object, "map", path, at),
    mapid: requiredNumber(object, "mapid", path, at),
    game_type: requiredString(object, "game_type", path, at),
    players,
    player_count: optionalNumber(object, "player_count", path) ?? players?.length ?? 0,
    online: optionalBoolean(object, "online", path) ?? false,
  };
}

function normalizeServerPlayer(value: unknown, path: string, at: string): ServerPlayer {
  const object = record(value, path, at);
  return {
    playername: requiredString(object, "playername", path, at),
    playerid: requiredNumber(object, "playerid", path, at),
    ping: optionalNumber(object, "ping", path) ?? 0,
    admin: optionalNumber(object, "admin", path) ?? 0,
  };
}

function normalizeMap(value: unknown, path: string, at: string): GameMap {
  const object = record(value, path, at);
  const mapId = object.mapid ?? object.map_id;
  const checkpointId = object.cp_id ?? mapId;
  return {
    mapid: requiredNumberValue(mapId, path, `${at}.mapid`),
    mapname: requiredString(object, "mapname", path, at),
    cp_id: requiredNumberValue(checkpointId, path, `${at}.cp_id`),
    ender: nullableStringOrNumber(object, "ender", path),
    author: nullableString(object, "author", path),
    released: nullableString(object, "released", path),
    type: nullableString(object, "type", path),
    difficulty: optionalDifficulty(object, "difficulty", path),
    individual_finish_count: optionalNumber(object, "individual_finish_count", path),
    video: nullableString(object, "video", path),
  };
}

function normalizePlayer(value: unknown, path: string, at: string): Player {
  const object = record(value, path, at);
  const activity =
    object.activity_summary === undefined || object.activity_summary === null
      ? undefined
      : normalizePlayerActivityAt(object.activity_summary, path, `${at}.activity_summary`);
  return {
    player_id: requiredNumber(object, "player_id", path, at),
    playername: requiredString(object, "playername", path, at),
    pref_name: optionalString(object, "pref_name", path),
    last_seen: optionalString(object, "last_seen", path),
    banned: optionalNumber(object, "banned", path),
    admin: optionalNumber(object, "admin", path),
    admin_speedrun: optionalNumber(object, "admin_speedrun", path),
    admin_emelie: optionalNumber(object, "admin_emelie", path),
    xp: optionalNumber(object, "xp", path),
    xp_speedrun: optionalNumber(object, "xp_speedrun", path),
    visits: optionalNumber(object, "visits", path),
    donated: optionalNumber(object, "donated", path),
    country: optionalString(object, "country", path),
    mapvote_pin: optionalString(object, "mapvote_pin", path),
    ...(activity ? { activity_summary: activity } : {}),
  };
}

function normalizeSimpleTop(value: unknown, path: string, at: string): SimpleTop {
  const object = record(value, path, at);
  return {
    cpid: requiredNumber(object, "cpid", path, at),
    finish_date: requiredString(object, "finish_date", path, at),
    fps: fps(object.fps, path, `${at}.fps`),
    map_name: requiredString(object, "map_name", path, at),
    rank: requiredNumber(object, "rank", path, at),
    runid: requiredNumber(object, "runid", path, at),
  };
}

function normalizePlayerRankAt(value: unknown, path: string, at: string): PlayerRankInfo {
  const object = record(value, path, at);
  return {
    player_id: requiredNumber(object, "player_id", path, at),
    player_name: requiredString(object, "player_name", path, at),
    total_xp: requiredNumber(object, "total_xp", path, at),
    prestige: requiredNumber(object, "prestige", path, at),
    level: requiredNumber(object, "level", path, at),
    level_display: requiredString(object, "level_display", path, at),
    title: requiredString(object, "title", path, at),
    xp_into_level: requiredNumber(object, "xp_into_level", path, at),
    xp_for_level: requiredNumber(object, "xp_for_level", path, at),
    xp_to_next: requiredNumber(object, "xp_to_next", path, at),
    maxed: requiredBoolean(object, "maxed", path, at),
    country: optionalString(object, "country", path),
    country_code: optionalString(object, "country_code", path),
    region: optionalString(object, "region", path),
    last_seen: requiredString(object, "last_seen", path, at),
  };
}

function normalizePlayerActivityAt(
  value: unknown,
  path: string,
  at: string,
): PlayerActivitySummary {
  const object = record(value, path, at);
  return {
    player_id: requiredNumber(object, "player_id", path, at),
    run_attempt_ms: requiredNumber(object, "run_attempt_ms", path, at),
    runtime_ms: requiredNumber(object, "runtime_ms", path, at),
    playing_ms: requiredNumber(object, "playing_ms", path, at),
    spectating_ms: requiredNumber(object, "spectating_ms", path, at),
    afk_ms: requiredNumber(object, "afk_ms", path, at),
    playing_afk_ms: requiredNumber(object, "playing_afk_ms", path, at),
    spectating_afk_ms: requiredNumber(object, "spectating_afk_ms", path, at),
    load_count: requiredNumber(object, "load_count", path, at),
    save_count: requiredNumber(object, "save_count", path, at),
    jump_count: requiredNumber(object, "jump_count", path, at),
    nadethrows: requiredNumber(object, "nadethrows", path, at),
    nadejumps: requiredNumber(object, "nadejumps", path, at),
    distance_travelled: requiredNumber(object, "distance_travelled", path, at),
    first_activity_at: nullableString(object, "first_activity_at", path),
    last_activity_at: nullableString(object, "last_activity_at", path),
    updated_at: requiredString(object, "updated_at", path, at),
  };
}

function record(value: unknown, path: string, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(path, field);
  }
  return value as JsonRecord;
}

function array(value: unknown, path: string, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse(path, field);
  return value;
}

function requiredString(object: JsonRecord, key: string, path: string, at: string): string {
  const value = object[key];
  if (typeof value !== "string") throw invalidResponse(path, `${at}.${key}`);
  return value;
}

function optionalString(object: JsonRecord, key: string, path: string): string | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidResponse(path, key);
  return value;
}

function nullableString(object: JsonRecord, key: string, path: string): string | null {
  return optionalString(object, key, path) ?? null;
}

function requiredNumber(object: JsonRecord, key: string, path: string, at: string): number {
  return requiredNumberValue(object[key], path, `${at}.${key}`);
}

function requiredNumberValue(value: unknown, path: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidResponse(path, field);
  return value;
}

function optionalNumber(object: JsonRecord, key: string, path: string): number | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidResponse(path, key);
  return value;
}

function nullableNumber(object: JsonRecord, key: string, path: string): number | null {
  return optionalNumber(object, key, path) ?? null;
}

function requiredBoolean(object: JsonRecord, key: string, path: string, at: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") throw invalidResponse(path, `${at}.${key}`);
  return value;
}

function optionalBoolean(object: JsonRecord, key: string, path: string): boolean | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalidResponse(path, key);
  return value;
}

function nullableStringOrNumber(
  object: JsonRecord,
  key: string,
  path: string,
): string | number | null {
  const value = object[key];
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
  object: JsonRecord,
  key: string,
  path: string,
): Record<string, number> | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  const values = record(value, path, key);
  const normalized: Record<string, number> = {};
  for (const [entryKey, entryValue] of Object.entries(values)) {
    normalized[entryKey] = requiredNumberValue(entryValue, path, `${key}.${entryKey}`);
  }
  return normalized;
}

function optionalFpsNumberRecord(
  object: JsonRecord,
  key: string,
  path: string,
): Partial<Record<Fps, number>> {
  const value = object[key];
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
  object: JsonRecord,
  key: string,
  path: string,
): Record<string, DifficultyData> | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  const values = record(value, path, key);
  const normalized: Record<string, DifficultyData> = {};
  for (const [fpsKey, difficulty] of Object.entries(values)) {
    const entry = record(difficulty, path, `${key}.${fpsKey}`);
    normalized[fpsKey] = {
      difficulty: requiredNumber(entry, "difficulty", path, `${key}.${fpsKey}`),
      nb_tops: requiredNumber(entry, "nb_tops", path, `${key}.${fpsKey}`),
    };
  }
  return normalized;
}
