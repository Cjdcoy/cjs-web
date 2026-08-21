import type { Player } from "../../lib/api";
import { parseCodName } from "../../lib/codName";
import { defineQuerySchema, enumQueryParam, stringQueryParam } from "../../lib/routing";

export { parseCodName } from "../../lib/codName";
export type { CodColorCode, CodNameSegment, ParsedCodName } from "../../lib/codName";

export const PLAYER_SEARCH_LIMIT = 50;
export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_DEBOUNCE_MS = 300;
export const PLAYER_DIRECTORY_BATCH_SIZE = 50;

export const playerDiscoveryQuerySchema = defineQuerySchema({
  q: stringQueryParam({ maxLength: 64, trim: true }),
  sort: enumQueryParam(["last-seen", "name", "visits"] as const, "last-seen"),
});

export type PlayerDiscoverySort = (typeof playerDiscoveryQuerySchema)["sort"]["defaultValue"];

const playerNameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

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
