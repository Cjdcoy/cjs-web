import type { TopRun } from "../../lib/api";

export interface RunProgressPoint {
  isPersonalBest: boolean;
  personalBestGainMs: number | null;
  personalBestMs: number;
  previousFinishDeltaMs: number | null;
  run: TopRun;
  sequence: number;
  timeMs: number;
  timestamp: number | null;
}

export interface RunProgressSummary {
  bestTimeMs: number;
  biggestGainMs: number;
  firstTimeMs: number;
  improvementMs: number;
  improvementPercent: number;
  medianTimeMs: number;
  personalBestCount: number;
  runCount: number;
}

export interface RunProgression {
  points: RunProgressPoint[];
  summary: RunProgressSummary | null;
}

export function createRunProgression(runs: readonly TopRun[]): RunProgression {
  const chronologicalRuns = runs
    .map((run, originalIndex) => ({
      originalIndex,
      run,
      timeMs: parseRunDurationMs(run),
      timestamp: parseTimestamp(run.time_created),
    }))
    .filter((item) => item.timeMs !== null)
    .sort((left, right) => {
      const leftTimestamp = left.timestamp ?? Number.POSITIVE_INFINITY;
      const rightTimestamp = right.timestamp ?? Number.POSITIVE_INFINITY;
      return leftTimestamp - rightTimestamp || left.originalIndex - right.originalIndex;
    });

  let personalBestMs = Number.POSITIVE_INFINITY;
  let previousFinishMs: number | null = null;

  const points = chronologicalRuns.map<RunProgressPoint>((item, index) => {
    const timeMs = item.timeMs as number;
    const priorBestMs = personalBestMs;
    const isPersonalBest = timeMs < priorBestMs;
    const personalBestGainMs =
      isPersonalBest && Number.isFinite(priorBestMs) ? priorBestMs - timeMs : null;

    personalBestMs = Math.min(personalBestMs, timeMs);
    const point: RunProgressPoint = {
      isPersonalBest,
      personalBestGainMs,
      personalBestMs,
      previousFinishDeltaMs: previousFinishMs === null ? null : timeMs - previousFinishMs,
      run: item.run,
      sequence: index + 1,
      timeMs,
      timestamp: item.timestamp,
    };
    previousFinishMs = timeMs;
    return point;
  });

  if (points.length === 0) return { points, summary: null };

  const firstTimeMs = points[0]?.timeMs ?? 0;
  const bestTimeMs = Math.min(...points.map((point) => point.timeMs));
  const sortedTimes = points.map((point) => point.timeMs).sort((left, right) => left - right);
  const middle = Math.floor(sortedTimes.length / 2);
  const medianTimeMs =
    sortedTimes.length % 2 === 0
      ? ((sortedTimes[middle - 1] ?? 0) + (sortedTimes[middle] ?? 0)) / 2
      : (sortedTimes[middle] ?? 0);
  const improvementMs = Math.max(0, firstTimeMs - bestTimeMs);

  return {
    points,
    summary: {
      bestTimeMs,
      biggestGainMs: Math.max(...points.map((point) => point.personalBestGainMs ?? 0)),
      firstTimeMs,
      improvementMs,
      improvementPercent: firstTimeMs > 0 ? improvementMs / firstTimeMs : 0,
      medianTimeMs,
      personalBestCount: points.filter((point) => point.sequence > 1 && point.isPersonalBest)
        .length,
      runCount: points.length,
    },
  };
}

export function parseRunDurationMs(run: TopRun): number | null {
  const formatted = run.time_played_string?.trim();
  if (formatted) {
    const parts = formatted.split(":");
    if (
      parts.length >= 1 &&
      parts.length <= 3 &&
      parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))
    ) {
      const values = parts.map(Number);
      const seconds = values.reduce((total, value) => total * 60 + value, 0);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
    }
  }

  return Number.isFinite(run.time_played) && run.time_played >= 0
    ? Math.round(run.time_played * 1_000)
    : null;
}

export function formatRunDurationMs(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not available";

  const totalHundredths = Math.round(milliseconds / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const suffix = `${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${suffix}`
    : `${minutes}:${suffix}`;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
