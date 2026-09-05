import type {
  Fps,
  GameMap,
  Player,
  PlayerLeaderboard,
  PlayerLeaderboardPosition,
  PlayerJumpScores,
  PlayerPerformanceStats,
  PlayerRankInfo,
  PlayerRouteCompletion,
  Source,
  TopRun,
} from "../../lib/api";
import { FPS_VALUES } from "../../lib/api";
import type { SortOrder } from "../../components/ui";
import {
  defineQuerySchema,
  enumQueryParam,
  integerQueryParam,
  stringQueryParam,
} from "../../lib/routing";

export const PLAYER_PROFILE_VIEWS = ["overview", "runs", "progress", "routes"] as const;
export type PlayerProfileView = (typeof PLAYER_PROFILE_VIEWS)[number];

export const BEST_RUN_SORTS = ["rank", "points", "date"] as const;
export type BestRunSort = (typeof BEST_RUN_SORTS)[number];

export const ROUTE_COMPLETION_STATUSES = ["all", "completed", "remaining"] as const;
export type RouteCompletionStatus = (typeof ROUTE_COMPLETION_STATUSES)[number];

export const playerProfileQuerySchema = defineQuerySchema({
  fps: enumQueryParam(FPS_VALUES, "125"),
  map: integerQueryParam({ min: 1 }),
  order: enumQueryParam(["asc", "desc"] as const, "asc"),
  q: stringQueryParam({ maxLength: 80, trim: true }),
  sort: enumQueryParam(BEST_RUN_SORTS, "rank"),
  status: enumQueryParam(ROUTE_COMPLETION_STATUSES, "all"),
  view: enumQueryParam(PLAYER_PROFILE_VIEWS, "overview"),
});

export interface PlayerRouteInventoryItem {
  completed: boolean;
  ender: string | null;
  fpsList: readonly Fps[];
  mapId: number;
  mapName: string;
  published: boolean;
  routeId: string;
  routeType: string | null;
  totalFinishes: number;
}

export interface PlayerRouteInventorySummary {
  archivedCompleted: number;
  completed: number;
  completionRate: number;
  remaining: number;
  total: number;
  totalFinishes: number;
}

export interface PlayerProfileIdentity {
  country: string | null;
  countryCode: string | null;
  lastSeen: string | null;
  name: string;
  playerId: number;
  region: string | null;
}

export interface PlayerIdentityInputs {
  directory: Player | null;
  performance: PlayerPerformanceStats | null;
  positions: readonly PlayerLeaderboardPosition[] | null;
  rank: PlayerRankInfo | null;
  routes: readonly PlayerRouteCompletion[] | null;
  scores: PlayerJumpScores | null;
}

export type RunAchievementTier = "first" | "second" | "third" | "top-ten";

export interface RunAchievement {
  label: "First place" | "Second place" | "Third place" | "Top 10";
  tier: RunAchievementTier;
}

const boardLabels: Readonly<Record<PlayerLeaderboard, string>> = {
  defrag: "Defrag skill",
  howmany: "Map completion",
  jump: "Jump skill",
  speed: "Speed skill",
  surf: "Surf skill",
};

const sourceLabels: Readonly<Record<Source, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

const numberFormatter = new Intl.NumberFormat();
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

export function playerBoardLabel(board: PlayerLeaderboard): string {
  return boardLabels[board];
}

export function playerSourceLabel(source: Source): string {
  return sourceLabels[source];
}

export function getRunAchievement(rank: number): RunAchievement | null {
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
  if (rank === 1) return { label: "First place", tier: "first" };
  if (rank === 2) return { label: "Second place", tier: "second" };
  if (rank === 3) return { label: "Third place", tier: "third" };
  return { label: "Top 10", tier: "top-ten" };
}

export function createPlayerRouteInventory(
  maps: readonly GameMap[],
  routes: readonly PlayerRouteCompletion[],
): PlayerRouteInventoryItem[] {
  const completionByRoute = new Map(
    routes.map((route) => [routeIdentity(route.map_id, route.ender), route]),
  );
  const inventory = maps.map((map) => {
    const routeId = routeIdentity(map.mapid, map.ender);
    const completion = completionByRoute.get(routeId);
    completionByRoute.delete(routeId);

    return {
      completed: completion !== undefined,
      ender:
        firstText(
          completion?.ender,
          map.ender === null || map.ender === undefined ? null : String(map.ender),
        ) || null,
      fpsList: completion?.fps_list ?? [],
      mapId: map.mapid,
      mapName: map.mapname,
      published: true,
      routeId,
      routeType: firstText(map.type) || null,
      totalFinishes: completion?.total_finishes ?? 0,
    };
  });

  for (const completion of completionByRoute.values()) {
    inventory.push({
      completed: true,
      ender: firstText(completion.ender) || null,
      fpsList: completion.fps_list,
      mapId: completion.map_id,
      mapName: completion.map_name,
      published: false,
      routeId: routeIdentity(completion.map_id, completion.ender),
      routeType: null,
      totalFinishes: completion.total_finishes,
    });
  }

  return inventory.sort((left, right) => left.mapName.localeCompare(right.mapName));
}

export function summarizePlayerRouteInventory(
  inventory: readonly PlayerRouteInventoryItem[],
): PlayerRouteInventorySummary {
  const published = inventory.filter((route) => route.published);
  const completed = published.filter((route) => route.completed).length;
  const archivedCompleted = inventory.filter((route) => !route.published && route.completed).length;
  const totalFinishes = inventory.reduce((total, route) => total + route.totalFinishes, 0);
  return {
    archivedCompleted,
    completed,
    completionRate: published.length === 0 ? 0 : completed / published.length,
    remaining: published.length - completed,
    total: published.length,
    totalFinishes,
  };
}

export function filterPlayerRouteInventory(
  inventory: readonly PlayerRouteInventoryItem[],
  filters: { query: string; status: RouteCompletionStatus },
): PlayerRouteInventoryItem[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return inventory.filter((route) => {
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "completed" ? route.completed : !route.completed);
    const searchText = `${route.mapName}\u0000${route.ender ?? ""}\u0000${route.routeType ?? ""}`;
    return matchesStatus && (query.length === 0 || searchText.toLocaleLowerCase().includes(query));
  });
}

export function createPlayerProfileIdentity(
  playerId: number,
  { directory, performance, positions, rank, routes, scores }: PlayerIdentityInputs,
): PlayerProfileIdentity {
  const embeddedRank = rank ?? performance?.rank ?? null;
  const position = positions?.[0];
  const route = routes?.[0];
  const name = firstText(
    directory?.pref_name,
    directory?.playername,
    embeddedRank?.player_name,
    position?.player_name,
    scores?.player_name,
    route?.player_name,
  );

  return {
    country:
      firstText(embeddedRank?.country, position?.country, scores?.country, directory?.country) ||
      null,
    countryCode:
      firstText(
        embeddedRank?.country_code,
        position?.country_code,
        scores?.country_code,
        directory?.country,
      ) || null,
    lastSeen:
      firstText(
        directory?.last_seen,
        embeddedRank?.last_seen,
        position?.last_seen,
        scores?.last_seen,
      ) || null,
    name: name || `Player #${playerId}`,
    playerId,
    region: firstText(embeddedRank?.region, position?.region, scores?.region) || null,
  };
}

export function hasProfileIdentity(identity: PlayerProfileIdentity): boolean {
  return identity.name !== `Player #${identity.playerId}`;
}

export function formatProfileNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : numberFormatter.format(value);
}

export function formatProfileDecimal(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : decimalFormatter.format(value);
}

export function formatProfilePercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return `${percentFormatter.format(value * 100)}%`;
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not available";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;

  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
}

export function formatDistance(distance: number): string {
  if (!Number.isFinite(distance) || distance < 0) return "Not available";
  return `${numberFormatter.format(Math.round(distance))} units`;
}

export function sortBestRuns(
  runs: readonly TopRun[],
  sort: BestRunSort,
  order: SortOrder,
): TopRun[] {
  const direction = order === "desc" ? -1 : 1;
  return [...runs].sort((left, right) => {
    const ascending =
      sort === "points"
        ? left.score - right.score || left.rank - right.rank
        : sort === "date"
          ? runTimestamp(left) - runTimestamp(right)
          : left.rank - right.rank || right.score - left.score;
    return ascending * direction;
  });
}

export function defaultBestRunOrder(sort: BestRunSort): SortOrder {
  return sort === "rank" ? "asc" : "desc";
}

export function formatRunTime(run: TopRun): string {
  if (run.time_played_string?.trim()) return run.time_played_string;
  if (!Number.isFinite(run.time_played)) return "Not available";
  return `${numberFormatter.format(run.time_played)} ms`;
}

export function fpsLabel(fps: Fps): string {
  return fps === "0" ? "Mix" : `${fps} FPS`;
}

export function formatFpsList(values: readonly Fps[]): string {
  if (values.length === 0) return "Not available";
  const labels = values.map((fps) => (fps === "0" ? "Mix" : fps));
  return `${labels.join(", ")}${values.some((fps) => fps !== "0") ? " FPS" : ""}`;
}

function runTimestamp(run: TopRun): number {
  // ponytail: epoch 0 stands in for "no date" so undated runs sort last in a plain numeric compare.
  const parsed = Date.parse(run.time_created ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function routeIdentity(mapId: number, ender: number | string | null | undefined): string {
  return `${mapId}:${String(ender ?? "")
    .trim()
    .toLocaleLowerCase()}`;
}
