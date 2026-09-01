import type { Fps, GameMap } from "../../lib/api";
import { FPS_VALUES } from "../../lib/api";
import {
  defineQuerySchema,
  enumQueryParam,
  integerQueryParam,
  stringQueryParam,
} from "../../lib/routing";
import { getSafeMediaUrl } from "./mapDetailModel";
import { hasMapVideos } from "./mapVideos";

export const MAP_MEDIA_FILTERS = ["all", "with-media", "without-media"] as const;
export const MAP_SORTS = ["completions", "released", "difficulty", "name"] as const;
export const MAP_VIEWS = ["list", "grid"] as const;

export type MapMediaFilter = (typeof MAP_MEDIA_FILTERS)[number];
export type MapSort = (typeof MAP_SORTS)[number];
export type MapView = (typeof MAP_VIEWS)[number];

export const mapDiscoveryQuerySchema = defineQuerySchema({
  q: stringQueryParam({ maxLength: 80, trim: true }),
  route: stringQueryParam({ defaultValue: "all", maxLength: 40, trim: true }),
  media: enumQueryParam(MAP_MEDIA_FILTERS, "all"),
  fps: enumQueryParam(FPS_VALUES, "125"),
  sort: enumQueryParam(MAP_SORTS, "released"),
  view: enumQueryParam(MAP_VIEWS, "grid"),
  page: integerQueryParam({ defaultValue: 1, min: 1, max: 10_000 }),
});

export interface MapDiscoveryFilters {
  q: string;
  route: string;
  media: MapMediaFilter;
  fps: Fps;
  sort: MapSort;
}

export interface PreparedMap {
  map: GameMap;
  normalizedName: string;
  routeType: string;
  searchText: string;
  hasMedia: boolean;
  completionCount: number;
  releaseTime: number | null;
}

const mapNameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function prepareMaps(maps: readonly GameMap[]): PreparedMap[] {
  return maps.map((map) => {
    const normalizedName = normalizeText(map.mapname);
    const normalizedAuthor = normalizeText(map.author ?? "");

    return {
      map,
      normalizedName,
      routeType: normalizeText(map.type ?? ""),
      searchText: `${normalizedName}\u0000${normalizedAuthor}`,
      hasMedia: hasMapVideos(map.mapname, map.video) || Boolean(getSafeMediaUrl(map.video)),
      completionCount: finiteNumber(map.individual_finish_count) ?? 0,
      releaseTime: parseReleaseTime(map.released),
    };
  });
}

export function getAvailableRouteTypes(items: readonly PreparedMap[]): string[] {
  const routeTypes = new Set<string>();
  for (const item of items) {
    if (item.routeType) routeTypes.add(item.routeType);
  }

  return [...routeTypes].sort((left, right) => mapNameCollator.compare(left, right));
}

export function filterAndSortMaps(
  items: readonly PreparedMap[],
  filters: MapDiscoveryFilters,
): PreparedMap[] {
  const query = normalizeText(filters.q);
  const route = normalizeText(filters.route);
  const filtered = items.filter(
    (item) =>
      (!query || item.searchText.includes(query)) &&
      (route === "all" || item.routeType === route) &&
      (filters.media === "all" ||
        (filters.media === "with-media" ? item.hasMedia : !item.hasMedia)),
  );

  return filtered.sort((left, right) => compareMaps(left, right, filters));
}

export function getMapDifficulty(map: GameMap, fps: Fps): number | null {
  return finiteNumber(map.difficulty?.[fps]?.difficulty);
}

export function getDifficultyLabel(value: number | null): string {
  if (value === null) return "Unrated";
  if (value < 2.5) return "Easy";
  if (value < 5) return "Medium";
  if (value < 7.5) return "Hard";
  return "Extreme";
}

function compareMaps(left: PreparedMap, right: PreparedMap, filters: MapDiscoveryFilters): number {
  let comparison = 0;

  if (filters.sort === "completions") {
    comparison = right.completionCount - left.completionCount;
  } else if (filters.sort === "released") {
    comparison = compareNullableNumbersDescending(left.releaseTime, right.releaseTime);
  } else if (filters.sort === "difficulty") {
    comparison = compareNullableNumbersDescending(
      getMapDifficulty(left.map, filters.fps),
      getMapDifficulty(right.map, filters.fps),
    );
  } else {
    comparison = mapNameCollator.compare(left.map.mapname, right.map.mapname);
  }

  if (comparison !== 0) return comparison;

  const nameComparison = mapNameCollator.compare(left.map.mapname, right.map.mapname);
  if (nameComparison !== 0) return nameComparison;
  return left.map.mapid - right.map.mapid;
}

function compareNullableNumbersDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function finiteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseReleaseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = Date.parse(
    /[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`,
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}
