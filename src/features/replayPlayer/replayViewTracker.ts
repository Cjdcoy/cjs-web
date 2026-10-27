/**
 * Pure state for web replay-view analytics (ADR 0005). One view is one mount of the player from its
 * first Play. Times are replay positions in ms from the start of the replay (0..durationMs).
 */
import type { AppRouteId } from "../../lib/routing";

/** The API's `speed_ms` columns, slowest first; cj-stats requires exactly these 5 entries. */
const API_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export type ReplayViewEntry = "map" | "recent" | "player" | "direct" | "other";
export type ReplayViewDevice = "mobile" | "desktop";
export type ReplayRange = readonly [number, number];

/** Wire format `v: 1` of `POST /replay/views`; cumulative except `played`. */
export interface ReplayViewPayload {
  v: 1;
  view_id: string;
  run_id: number;
  seq: number;
  duration_ms: number;
  speed_ms: number[];
  watched: ReplayRange[];
  played: ReplayRange[];
  max_pos_ms: number;
  seeks: number;
  top_seeks: ReplayRange[];
  auto_skip: boolean;
  skipped_fails: number;
  cinema: boolean;
  fullscreen: boolean;
  entry: ReplayViewEntry;
  device: ReplayViewDevice;
}

export interface ReplayViewFlags {
  autoSkip?: boolean;
  skippedFails?: number;
  cinema?: boolean;
  fullscreen?: boolean;
}

interface PendingSeek {
  from: number;
  to: number;
  at: number;
}

export interface ReplayViewState {
  readonly viewId: string;
  readonly runId: number;
  readonly durationMs: number;
  readonly entry: ReplayViewEntry;
  readonly device: ReplayViewDevice;
  /** Last sent sequence number; the next flush sends `seq + 1`. */
  readonly seq: number;
  readonly speedMs: readonly number[];
  readonly watched: readonly ReplayRange[];
  readonly played: readonly ReplayRange[];
  readonly maxPosMs: number;
  readonly seeks: number;
  readonly topSeeks: readonly ReplayRange[];
  /** A slider drag in progress: seeks under SEEK_MERGE_MS apart extend it. */
  readonly pendingSeek: PendingSeek | null;
  readonly autoSkip: boolean;
  readonly skippedFails: number;
  readonly cinema: boolean;
  readonly fullscreen: boolean;
  /** Something changed since the last flush. */
  readonly dirty: boolean;
}

export const MIN_REPORTED_WATCH_MS = 5_000;
export const FLUSH_INTERVAL_MS = 30_000;
export const MAX_RANGES = 64;
export const MAX_TOP_SEEKS = 10;
export const SEEK_MERGE_MS = 500;
/** The API stores `seeks` and `skipped_fails` as 16-bit counters. */
const MAX_COUNTER = 65_535;

export function createReplayView(init: {
  viewId: string;
  runId: number;
  durationMs: number;
  entry: ReplayViewEntry;
  device: ReplayViewDevice;
}): ReplayViewState {
  return {
    ...init,
    durationMs: Math.max(1, Math.round(init.durationMs)),
    seq: 0,
    speedMs: API_SPEEDS.map(() => 0),
    watched: [],
    played: [],
    maxPosMs: 0,
    seeks: 0,
    topSeeks: [],
    pendingSeek: null,
    autoSkip: false,
    skippedFails: 0,
    cinema: false,
    fullscreen: false,
    dirty: false,
  };
}

/** A stretch played at real speed while the tab was visible. */
export function recordSegment(
  state: ReplayViewState,
  fromT: number,
  toT: number,
  wallMs: number,
  speed: number,
): ReplayViewState {
  // shortcut: 0.1× counts as 0.25× because the API has 5 speed columns (cj-stats replay_views.go:159); add a column if slow-motion share matters.
  const speedIndex = speed === 0.1 ? 0 : API_SPEEDS.findIndex((value) => value === speed);
  const wall = Math.max(0, Math.round(wallMs));
  const range = clampRange(state, fromT, toT);
  if (speedIndex < 0 || (wall === 0 && !range)) return state;
  const speedMs = state.speedMs.map((value, index) =>
    index === speedIndex ? value + wall : value,
  );
  if (!range) return { ...state, speedMs, dirty: true };
  return {
    ...state,
    speedMs,
    watched: mergeRange(state.watched, range),
    played: appendPlayed(state.played, range),
    maxPosMs: Math.max(state.maxPosMs, range[1]),
    dirty: true,
  };
}

/** A viewer seek; seeks under 500 ms apart (one slider drag) count once, first `from` to last `to`. */
export function recordSeek(
  state: ReplayViewState,
  from: number,
  to: number,
  atMs: number,
): ReplayViewState {
  const fromT = clampPosition(state, from);
  const toT = clampPosition(state, to);
  const pending = state.pendingSeek;
  if (pending && atMs - pending.at < SEEK_MERGE_MS) {
    return { ...state, pendingSeek: { from: pending.from, to: toT, at: atMs }, dirty: true };
  }
  if (fromT === toT) return state;
  return {
    ...commitSeek(state),
    pendingSeek: { from: fromT, to: toT, at: atMs },
    dirty: true,
  };
}

/** Auto-skip on while playing and modes used at all stay set; the fail count only grows. */
export function noteFlags(state: ReplayViewState, flags: ReplayViewFlags): ReplayViewState {
  const next = {
    autoSkip: state.autoSkip || flags.autoSkip === true,
    skippedFails: Math.max(state.skippedFails, Math.round(flags.skippedFails ?? 0)),
    cinema: state.cinema || flags.cinema === true,
    fullscreen: state.fullscreen || flags.fullscreen === true,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => next[key] !== state[key],
  );
  return changed ? { ...state, ...next, dirty: true } : state;
}

/**
 * The next payload and the state after sending it, or null when nothing changed or there is less
 * than 5 s of real playback. `played` starts over after each flush; everything else is cumulative,
 * so a lost or repeated beacon is harmless (the server keeps the highest `seq`).
 */
export function takeFlush(
  state: ReplayViewState,
): { payload: ReplayViewPayload; state: ReplayViewState } | null {
  if (!state.dirty || watchWallMs(state) < MIN_REPORTED_WATCH_MS) return null;
  const seq = state.seq + 1;
  const seeks = commitSeek(state);
  return {
    payload: {
      v: 1,
      view_id: state.viewId,
      run_id: state.runId,
      seq,
      duration_ms: state.durationMs,
      speed_ms: [...state.speedMs],
      watched: [...state.watched],
      played: [...state.played],
      max_pos_ms: state.maxPosMs,
      seeks: Math.min(MAX_COUNTER, seeks.seeks),
      top_seeks: [...seeks.topSeeks],
      auto_skip: state.autoSkip,
      skipped_fails: Math.min(MAX_COUNTER, state.skippedFails),
      cinema: state.cinema,
      fullscreen: state.fullscreen,
      entry: state.entry,
      device: state.device,
    },
    // The open drag stays pending so a drag across a flush still counts once.
    state: { ...state, seq, played: [], dirty: false },
  };
}

export function watchWallMs(state: ReplayViewState): number {
  return state.speedMs.reduce((total, value) => total + value, 0);
}

/**
 * Inserts a range into sorted, non-overlapping ranges, joining touching ones. Above `cap`, the pair
 * with the smallest gap between them is joined until it fits.
 */
export function mergeRange(
  ranges: readonly ReplayRange[],
  range: ReplayRange,
  cap = MAX_RANGES,
): ReplayRange[] {
  const sorted = [...ranges, range].sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  while (merged.length > cap) {
    let smallest = 0;
    for (let index = 1; index < merged.length - 1; index += 1) {
      const gap = merged[index + 1][0] - merged[index][1];
      if (gap < merged[smallest + 1][0] - merged[smallest][1]) smallest = index;
    }
    merged.splice(smallest, 2, [merged[smallest][0], merged[smallest + 1][1]]);
  }
  return merged;
}

/** Do Not Track or Global Privacy Control opt the browser out of collection. */
export function trackingAllowed(
  browser: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined,
  legacyDoNotTrack?: string | null,
): boolean {
  return (
    browser?.globalPrivacyControl !== true &&
    browser?.doNotTrack !== "1" &&
    legacyDoNotTrack !== "1"
  );
}

export function viewDevice(matchMedia: ((query: string) => { matches: boolean }) | undefined) {
  return matchMedia?.("(max-width: 767px), (pointer: coarse)").matches ? "mobile" : "desktop";
}

/** Where the viewer came from inside the site; never the referrer or an external URL. */
export function viewEntry(previousRoute: AppRouteId | null): ReplayViewEntry {
  if (previousRoute === null) return "direct";
  if (previousRoute === "map-detail" || previousRoute === "map-viewer") return "map";
  if (previousRoute === "player-detail") return "player";
  if (previousRoute === "recent") return "recent";
  return "other";
}

/** 128 random bits as 32 lowercase hex digits; held in memory only. */
export function newViewId(random: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  return Array.from(random.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function commitSeek(state: ReplayViewState): ReplayViewState {
  const pending = state.pendingSeek;
  if (!pending || pending.from === pending.to) return { ...state, pendingSeek: null };
  const seek: ReplayRange = [pending.from, pending.to];
  const distance = (range: ReplayRange) => Math.abs(range[1] - range[0]);
  return {
    ...state,
    seeks: state.seeks + 1,
    topSeeks: [...state.topSeeks, seek]
      .sort((left, right) => distance(right) - distance(left))
      .slice(0, MAX_TOP_SEEKS),
    pendingSeek: null,
  };
}

function appendPlayed(played: readonly ReplayRange[], range: ReplayRange): ReplayRange[] {
  const next = [...played, range];
  if (next.length <= MAX_RANGES) return next;
  // ponytail: drops the shortest segment past 64 per flush (only heat watch_ms loses it); flush early if it ever matters.
  let shortest = 0;
  next.forEach(([start, end], index) => {
    if (end - start < next[shortest][1] - next[shortest][0]) shortest = index;
  });
  return next.filter((_, index) => index !== shortest);
}

function clampRange(state: ReplayViewState, fromT: number, toT: number): ReplayRange | null {
  const start = clampPosition(state, fromT);
  const end = clampPosition(state, toT);
  return end > start ? [start, end] : null;
}

function clampPosition(state: ReplayViewState, value: number): number {
  return Math.min(state.durationMs, Math.max(0, Math.round(value)));
}
