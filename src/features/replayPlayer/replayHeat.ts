import type { ReplayWebViewHeat } from "../../lib/api";

export const MAX_HEAT_STOPS = 200;

/** One gradient band: `start` and `end` are fractions of the timeline, `level` is 0..1. */
export interface HeatStop {
  start: number;
  end: number;
  level: number;
}

/**
 * Downsamples the 5 s buckets to at most `maxStops` bands, keeping each band's peak so short
 * hot spots stay visible on long replays. Empty when nobody has watched.
 */
export function heatStops(
  heat: ReplayWebViewHeat,
  spanMs: number,
  maxStops = MAX_HEAT_STOPS,
): HeatStop[] {
  const counts = heat.view_count;
  const peak = Math.max(0, ...counts);
  if (peak === 0 || spanMs <= 0) return [];
  const group = Math.ceil(counts.length / maxStops);
  const stops: HeatStop[] = [];
  for (let first = 0; first < counts.length; first += group) {
    const start = (first * heat.bucket_ms) / spanMs;
    if (start >= 1) break;
    const value = Math.max(...counts.slice(first, first + group));
    const end = Math.min(1, ((first + group) * heat.bucket_ms) / spanMs);
    stops.push({ start, end, level: value / peak });
  }
  return stops;
}

/** One CSS gradient with hard stops; the accent token fades to transparent for cold bands. */
export function heatGradient(stops: readonly HeatStop[]): string {
  const percent = (value: number) => `${Math.round(value * 1_000) / 10}%`;
  const bands = stops.map(
    ({ start, end, level }) =>
      `color-mix(in srgb, var(--cjs-color-accent) ${Math.round(level * 100)}%, transparent) ${percent(start)} ${percent(end)}`,
  );
  const tail = stops.at(-1)?.end ?? 0;
  if (tail < 1) bands.push(`transparent ${percent(tail)}`);
  return `linear-gradient(to right, ${bands.join(", ")})`;
}

/** The first stretch of consecutive buckets at the peak view count, in replay ms. */
export function mostWatched(
  heat: ReplayWebViewHeat,
  spanMs: number,
): { start: number; end: number } | null {
  const counts = heat.view_count;
  const peak = Math.max(0, ...counts);
  if (peak === 0) return null;
  const first = counts.indexOf(peak);
  let last = first;
  while (counts[last + 1] === peak) last += 1;
  return {
    start: Math.min(spanMs, first * heat.bucket_ms),
    end: Math.min(spanMs, (last + 1) * heat.bucket_ms),
  };
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatHeatClock(milliseconds: number): string {
  const total = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
