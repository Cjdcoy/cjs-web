/**
 * Jump4Life rank emblems.
 *
 * Emblem artwork and the level-to-image banding are published by Jump4Life; the
 * mapping below mirrors their leveling module so a level resolves to the same
 * emblem here as it does there. Levels 1-43 share eight "core" emblems in bands
 * of six, levels 44-50 each get their own "mythic" emblem, and prestige uses the
 * compact badge variant.
 */

const MAX_LEVEL = 50;
const MAX_PRESTIGE = 10;
const FIRST_MYTHIC_LEVEL = 44;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function normalize(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < 1) return null;
  return Math.min(max, truncated);
}

/** Emblem for a Jump4Life level, or null when the level is missing or invalid. */
export function levelEmblemUrl(level: unknown): string | null {
  const normalized = normalize(level, MAX_LEVEL);
  if (normalized === null) return null;

  if (normalized >= FIRST_MYTHIC_LEVEL) {
    return `/ranks/rank-mythic-${pad(normalized - (FIRST_MYTHIC_LEVEL - 1))}.avif`;
  }

  const core = normalized === 1 ? 1 : Math.floor((normalized - 2) / 6) + 2;
  return `/ranks/rank-core-${pad(core)}.avif`;
}

/** Compact prestige badge, or null when the player has not prestiged. */
export function prestigeEmblemUrl(prestige: unknown): string | null {
  const normalized = normalize(prestige, MAX_PRESTIGE);
  if (normalized === null) return null;
  return `/ranks/rank-prestige-${pad(normalized)}-compact.avif`;
}
