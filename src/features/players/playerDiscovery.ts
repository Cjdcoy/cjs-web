import type { Player } from "../../lib/api";
import { defineQuerySchema, enumQueryParam, stringQueryParam } from "../../lib/routing";

export const PLAYER_SEARCH_LIMIT = 50;
export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_DEBOUNCE_MS = 300;

export const playerDiscoveryQuerySchema = defineQuerySchema({
  q: stringQueryParam({ maxLength: 64, trim: true }),
  sort: enumQueryParam(["last-seen", "name", "visits"] as const, "last-seen"),
});

export type PlayerDiscoverySort = (typeof playerDiscoveryQuerySchema)["sort"]["defaultValue"];

export type CodColorCode = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export interface CodNameSegment {
  color: CodColorCode | null;
  text: string;
}

export interface ParsedCodName {
  plainText: string;
  segments: CodNameSegment[];
}

const codColorPattern = /^[0-9]$/;
const playerNameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function parseCodName(value: string): ParsedCodName {
  const segments: CodNameSegment[] = [];
  let color: CodColorCode | null = null;
  let text = "";

  const flush = () => {
    if (!text) return;
    segments.push({ color, text });
    text = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const possibleColor = value[index + 1];

    if (character === "^" && possibleColor !== undefined && codColorPattern.test(possibleColor)) {
      flush();
      color = possibleColor as CodColorCode;
      index += 1;
      continue;
    }

    text += character;
  }

  flush();
  const plainText = segments
    .map((segment) => segment.text)
    .join("")
    .trim();

  if (plainText) return { plainText, segments };

  return {
    plainText: "Unknown player",
    segments: [{ color: null, text: "Unknown player" }],
  };
}

export function playerDisplayName(player: Player): string {
  return player.pref_name?.trim() || player.playername;
}

export function sortPlayers(players: readonly Player[], sort: PlayerDiscoverySort): Player[] {
  return [...players].sort((left, right) => {
    if (sort === "name") {
      return compareNames(left, right) || left.player_id - right.player_id;
    }

    if (sort === "visits") {
      return (
        sortableNumber(right.visits) - sortableNumber(left.visits) ||
        compareNames(left, right) ||
        left.player_id - right.player_id
      );
    }

    return (
      sortableDate(right.last_seen) - sortableDate(left.last_seen) ||
      compareNames(left, right) ||
      left.player_id - right.player_id
    );
  });
}

function compareNames(left: Player, right: Player): number {
  const leftName = parseCodName(playerDisplayName(left)).plainText;
  const rightName = parseCodName(playerDisplayName(right)).plainText;
  return playerNameCollator.compare(leftName, rightName);
}

function sortableNumber(value: number | undefined): number {
  return Number.isFinite(value) ? (value ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
}

function sortableDate(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
