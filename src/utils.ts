import type { GameMap, Player } from "./types";

export function cleanName(value = "") {
  return value.replace(/\^./g, "").trim() || "Unknown";
}

export function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : "0";
}

export function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function timeAgo(value?: string) {
  if (!value) return "Never";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return value;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

export function getDifficulty(map: GameMap, fps = "125") {
  const value = map.difficulty?.[fps]?.difficulty ?? map.difficulty?.["0"]?.difficulty;
  return typeof value === "number" && value >= 0 ? value : null;
}

export function difficultyLabel(value: number | null) {
  if (value === null) return "Unrated";
  if (value < 2.5) return "Easy";
  if (value < 5) return "Medium";
  if (value < 7.5) return "Hard";
  return "Extreme";
}

export function serverRegion(domain: string) {
  const key = domain.split(".")[0]?.toUpperCase();
  const regions: Record<string, string> = {
    AU: "Australia",
    DE: "Germany",
    HK: "Hong Kong",
    HU: "Hungary",
    RO: "Romania",
    UAE: "United Arab Emirates",
    UK: "United Kingdom",
    US: "United States",
  };
  return { code: key || "??", name: regions[key] || key || "Unknown" };
}

const FAVORITE_MAPS = "jhstats:favorite-maps";
const FAVORITE_PLAYERS = "jhstats:favorite-players";

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("favorites-changed"));
}

export const favorites = {
  maps: () => read<GameMap & { source?: string }>(FAVORITE_MAPS),
  players: () => read<Player & { source?: string }>(FAVORITE_PLAYERS),
  toggleMap(map: GameMap, source: string) {
    const values = favorites.maps();
    const exists = values.some((entry) => entry.mapid === map.mapid && entry.source === source);
    write(
      FAVORITE_MAPS,
      exists
        ? values.filter((entry) => !(entry.mapid === map.mapid && entry.source === source))
        : [...values, { ...map, source }],
    );
    return !exists;
  },
  togglePlayer(player: Player, source: string) {
    const values = favorites.players();
    const exists = values.some(
      (entry) => entry.player_id === player.player_id && entry.source === source,
    );
    write(
      FAVORITE_PLAYERS,
      exists
        ? values.filter(
            (entry) => !(entry.player_id === player.player_id && entry.source === source),
          )
        : [...values, { ...player, source }],
    );
    return !exists;
  },
};
