import {
  FPS_VALUES,
  LEADERBOARD_KINDS,
  type Fps,
  type LeaderboardEntry,
  type RankLeaderboardEntry,
  type Source,
} from "../../lib/api";
import { stripCodColorCodes } from "../../lib/codName";
import {
  defineQuerySchema,
  enumQueryParam,
  readQueryState,
  stringQueryParam,
  updateQuerySearch,
  type QueryState,
} from "../../lib/routing";

export const LEADERBOARD_BOARDS = [...LEADERBOARD_KINDS, "rank-xp"] as const;
export type LeaderboardBoard = (typeof LEADERBOARD_BOARDS)[number];

export const LEADERBOARD_SORTS = ["rank", "player", "value"] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const leaderboardQuerySchema = defineQuerySchema({
  board: enumQueryParam(LEADERBOARD_BOARDS, "speed-skill"),
  fps: enumQueryParam(FPS_VALUES, "125"),
  order: enumQueryParam(SORT_ORDERS, "asc"),
  query: stringQueryParam({ defaultValue: "", maxLength: 80, trim: true }),
  sort: enumQueryParam(LEADERBOARD_SORTS, "rank"),
});

export type LeaderboardQueryState = QueryState<typeof leaderboardQuerySchema>;

export interface LeaderboardRow {
  playerId: number;
  playerName: string;
  rank: number;
  country?: string;
  countryCode?: string;
  region?: string;
  lastSeen?: string;
  rating?: number;
  score?: number;
  topList?: Record<string, number>;
  totalXp?: number;
  level?: number;
  levelDisplay?: string;
  prestige?: number;
  metric: number | null;
}

export interface TopPlaceCount {
  place: number;
  count: number;
}

const unsupportedLegacyParameters = [
  "country",
  "limit",
  "page",
  "player",
  "region",
  "seen",
] as const;

export function boardUsesFps(board: LeaderboardBoard): boolean {
  return board !== "howmany" && board !== "rank-xp";
}

export function normalizeLeaderboardState(
  state: LeaderboardQueryState,
  source: Source,
): LeaderboardQueryState {
  const board = source === "jh" && state.board === "rank-xp" ? "speed-skill" : state.board;

  return {
    ...state,
    board,
    fps: boardUsesFps(board) ? state.fps : "125",
  };
}

export function canonicalizeLeaderboardSearch(search: string, source: Source): string {
  const state = normalizeLeaderboardState(readQueryState(search, leaderboardQuerySchema), source);
  const sourceParameters = new URLSearchParams(search);

  if (source === "j4l") {
    sourceParameters.set("source", "j4l");
  } else {
    sourceParameters.delete("source");
  }

  for (const parameter of unsupportedLegacyParameters) {
    sourceParameters.delete(parameter);
  }

  const sourceSearch = sourceParameters.toString();
  return updateQuerySearch(sourceSearch ? `?${sourceSearch}` : "", leaderboardQuerySchema, state);
}

export function createLeaderboardRows(
  entries: readonly (LeaderboardEntry | RankLeaderboardEntry)[],
  board: LeaderboardBoard,
): LeaderboardRow[] {
  return entries.map((entry) => {
    if (isRankLeaderboardEntry(entry)) {
      return {
        playerId: entry.player_id,
        playerName: entry.player_name,
        rank: entry.rank,
        country: entry.country,
        countryCode: entry.country_code,
        region: entry.region,
        lastSeen: entry.last_seen,
        totalXp: entry.total_xp,
        level: entry.level,
        levelDisplay: entry.level_display,
        prestige: entry.prestige,
        metric: entry.total_xp,
      };
    }

    return {
      playerId: entry.player_id,
      playerName: entry.player_name,
      rank: entry.rank,
      country: entry.country,
      countryCode: entry.country_code,
      region: entry.region,
      lastSeen: entry.last_seen,
      rating: entry.rating,
      score: entry.score,
      topList: entry.top_list,
      metric: board === "howmany" ? (entry.score ?? null) : (entry.rating ?? entry.score ?? null),
    };
  });
}

export function filterLeaderboardRows(
  rows: readonly LeaderboardRow[],
  query: string,
): LeaderboardRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...rows];

  return rows.filter((row) =>
    [stripCodColorCodes(row.playerName), row.country, row.countryCode, row.region]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

export function sortLeaderboardRows(
  rows: readonly LeaderboardRow[],
  sort: LeaderboardSort,
  order: SortOrder,
): LeaderboardRow[] {
  const direction = order === "asc" ? 1 : -1;
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

  return rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => {
      let comparison = 0;

      if (sort === "player") {
        comparison =
          collator.compare(
            stripCodColorCodes(left.row.playerName),
            stripCodColorCodes(right.row.playerName),
          ) * direction;
      } else if (sort === "value") {
        comparison = compareOptionalNumbers(left.row.metric, right.row.metric, direction);
      } else {
        comparison = (left.row.rank - right.row.rank) * direction;
      }

      return comparison || left.index - right.index;
    })
    .map(({ row }) => row);
}

export function createTopPlaceDistribution(
  topList: Readonly<Record<string, number>> | undefined,
): TopPlaceCount[] | null {
  if (!topList) return null;

  let hasKnownPlace = false;
  const distribution = Array.from({ length: 10 }, (_, index) => {
    const place = index + 1;
    const directCount = topList[String(place)];
    const legacyCount = topList[`top${place}`];

    if (directCount !== undefined || legacyCount !== undefined) {
      hasKnownPlace = true;
    }

    return {
      place,
      count: directCount ?? legacyCount ?? 0,
    };
  });

  return hasKnownPlace ? distribution : null;
}

export function metricLabel(board: LeaderboardBoard): string {
  if (board === "rank-xp") return "Total XP";
  if (board === "howmany") return "Maps completed";
  return "Rating";
}

export function boardLabel(board: LeaderboardBoard): string {
  const labels: Record<LeaderboardBoard, string> = {
    "speed-skill": "Speed skill",
    "jump-skill": "Jump skill",
    "defrag-skill": "Defrag skill",
    "surf-skill": "Surf skill",
    howmany: "Map completions",
    "rank-xp": "J4L rank XP",
  };

  return labels[board];
}

export function requestedFps(board: LeaderboardBoard, fps: Fps): Fps | undefined {
  return boardUsesFps(board) ? fps : undefined;
}

function isRankLeaderboardEntry(
  entry: LeaderboardEntry | RankLeaderboardEntry,
): entry is RankLeaderboardEntry {
  return "total_xp" in entry;
}

function compareOptionalNumbers(
  left: number | null,
  right: number | null,
  direction: 1 | -1,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}
