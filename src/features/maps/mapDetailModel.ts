import { type Fps, type GameMap, type MapPlayerPlaytime, type TopRun } from "../../lib/api";
import { stripCodColorCodes } from "../../lib/codName";
import { defineQuerySchema, enumQueryParam, integerQueryParam } from "../../lib/routing";

export type MapLookup = "mapid" | "cpid";

export interface MapRecord {
  mapId: number;
  defaultCheckpointId: number;
  checkpoints: GameMap[];
}

export const MAP_PROFILE_FPS_VALUES = ["125", "250", "333", "0"] as const satisfies readonly Fps[];
export type MapProfileFps = (typeof MAP_PROFILE_FPS_VALUES)[number];

export const MAP_DETAIL_VIEWS = ["tops", "played"] as const;
export type MapDetailView = (typeof MAP_DETAIL_VIEWS)[number];

/** "all" sums every FPS on the page's list, one request per FPS. */
export const PLAYTIME_FPS_VALUES = [...MAP_PROFILE_FPS_VALUES, "all"] as const;
export type PlaytimeFps = (typeof PLAYTIME_FPS_VALUES)[number];

export const mapDetailQuerySchema = defineQuerySchema({
  fps: enumQueryParam(MAP_PROFILE_FPS_VALUES, "125"),
  cp: integerQueryParam({ defaultValue: 0, min: 1 }),
  view: enumQueryParam(MAP_DETAIL_VIEWS, "tops"),
  pfps: enumQueryParam(PLAYTIME_FPS_VALUES, "all"),
});

export interface PlaytimeRow extends MapPlayerPlaytime {
  /** FPS values the player has playtime at, in page order. */
  fps: MapProfileFps[];
}

/**
 * Route filter for playtime: the selected route's ender on a multi-route map, or null when the
 * map has one route or the route has no ender to filter on (playtime then covers every route).
 */
export function getPlaytimeRouteEnder(record: MapRecord, route: GameMap): string | null {
  if (record.checkpoints.length < 2) return null;
  const ender = route.ender === null || route.ender === undefined ? "" : String(route.ender).trim();
  return ender || null;
}

/** Playtime as "45s" under a minute, else truncated hours and minutes ("26h 05m", "0h 42m"). */
export function formatPlaytime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Not available";
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Merges per-FPS playtime by player, summing seconds, most played first. */
export function mergePlaytime(
  perFps: readonly (readonly [MapProfileFps, readonly MapPlayerPlaytime[]])[],
): PlaytimeRow[] {
  const byPlayer = new Map<number, PlaytimeRow>();
  for (const [fps, rows] of perFps) {
    for (const row of rows) {
      const merged = byPlayer.get(row.player_id);
      if (merged) {
        merged.time_played += row.time_played;
        merged.fps.push(fps);
      } else {
        byPlayer.set(row.player_id, { ...row, fps: [fps] });
      }
    }
  }
  return [...byPlayer.values()].sort(
    (left, right) => right.time_played - left.time_played || left.player_id - right.player_id,
  );
}

export function parseMapRouteId(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveMapRecord(
  maps: readonly GameMap[],
  requestedId: number,
  lookup: MapLookup,
): MapRecord | null {
  const requestedMap = maps.find((map) =>
    lookup === "cpid" ? map.cp_id === requestedId : map.mapid === requestedId,
  );
  if (!requestedMap) return null;

  const checkpoints = new Map<number, GameMap>();
  for (const map of maps) {
    if (map.mapid === requestedMap.mapid && !checkpoints.has(map.cp_id)) {
      checkpoints.set(map.cp_id, map);
    }
  }

  return {
    mapId: requestedMap.mapid,
    defaultCheckpointId: requestedMap.cp_id,
    checkpoints: [...checkpoints.values()].sort((left, right) => left.cp_id - right.cp_id),
  };
}

export function selectCheckpoint(record: MapRecord, requestedCheckpointId: number): GameMap {
  if (requestedCheckpointId > 0) {
    const requestedCheckpoint = record.checkpoints.find(
      (map) => map.cp_id === requestedCheckpointId,
    );
    if (requestedCheckpoint) return requestedCheckpoint;
  }

  return (
    record.checkpoints.find((map) => map.cp_id === record.defaultCheckpointId) ??
    record.checkpoints[0]
  );
}

export function hasMapTopRuns(map: GameMap, fps: MapProfileFps): boolean {
  const rating = map.difficulty?.[fps];
  if (!rating) return false;
  // difficulty -1: the API skipped counting tops (nade-jump or defrag/surf top run), so nb_tops is
  // meaningless and the only way to know whether runs exist is to fetch them. -2 means truly none.
  if (rating.difficulty === -1) return true;
  return Number.isFinite(rating.nb_tops) && rating.nb_tops > 0;
}

export function describeUnratedDifficulty(map: GameMap, fps: Fps | string): string {
  const difficulty = map.difficulty?.[fps]?.difficulty;
  if (difficulty === -2) return "No runs have been recorded at this FPS yet.";
  if (difficulty === -1) {
    const type = map.type?.trim().toLowerCase();
    if (type === "defrag" || type === "surf") return "Difficulty is only rated for jump maps.";
    return "The fastest run uses more than 3 nade jumps, so the difficulty formula does not apply.";
  }
  return "No difficulty data is available for this FPS.";
}

export function selectMapProfileFps(map: GameMap, requestedFps: MapProfileFps): MapProfileFps {
  if (hasMapTopRuns(map, requestedFps)) return requestedFps;
  return MAP_PROFILE_FPS_VALUES.find((fps) => hasMapTopRuns(map, fps)) ?? "125";
}

export function getMapRouteLabel(map: GameMap, index: number): string {
  const routeName = map.ender === null || map.ender === undefined ? "" : String(map.ender).trim();
  return routeName ? `Route ${index + 1}: ${routeName}` : `Route ${index + 1}`;
}

export function getSafeMediaUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function getPlainPlayerName(value: string): string {
  return stripCodColorCodes(value);
}

export function formatRunTime(run: TopRun): string {
  if (run.time_played_string?.trim()) return run.time_played_string;
  if (!Number.isFinite(run.time_played)) return "Time unavailable";

  const totalSeconds = Math.max(0, run.time_played);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${seconds}s`;
}

export function formatRunDate(value: string | undefined): string {
  if (!value?.trim()) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}
