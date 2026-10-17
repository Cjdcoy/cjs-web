import type { ReplayMarker, ReplayMarkerKind, ReplaySamples } from "../../lib/api";
import { leanFraction, type CodPose } from "../mapViewer";

/**
 * CoD2 eye height above the feet origin by recorder stance code (0 stand, 1 crouch, 2 prone),
 * matching the game's DEFAULT/CROUCH/PRONE view heights. Unknown codes use standing height.
 */
export const VIEW_HEIGHT_BY_STANCE: readonly number[] = [60, 40, 11];

/**
 * A segment is a teleport when the feet move further than the sampled speed allows. The factor
 * and slack absorb acceleration within one tick (gravity, jump impulse, bounces).
 */
const TELEPORT_SPEED_FACTOR = 2;
const TELEPORT_SLACK_UNITS = 32;

/** View-height waypoints (percent of the lerp, height) from CoD2's bg_pmove viewLerp_* tables. */
type ViewLerpTable = readonly (readonly [percent: number, height: number])[];
const VIEW_LERP_CROUCH_PRONE: ViewLerpTable = [
  [0, 40],
  [11, 38],
  [22, 33],
  [34, 25],
  [45, 16],
  [50, 15],
  [55, 16],
  [70, 18],
  [90, 17],
  [100, 11],
];
const VIEW_LERP_STAND_CROUCH: ViewLerpTable = [
  [0, 60],
  [1, 59.5],
  [4, 58.5],
  [30, 56],
  [80, 44],
  [90, 41.5],
  [95, 40.5],
  [100, 40],
];
const VIEW_LERP_CROUCH_STAND: ViewLerpTable = [
  [0, 40],
  [5, 40.5],
  [10, 41.5],
  [20, 44],
  [70, 56],
  [96, 58.5],
  [99, 59.5],
  [100, 60],
];
const VIEW_LERP_PRONE_CROUCH: ViewLerpTable = [
  [0, 11],
  [5, 10],
  [30, 21],
  [50, 25],
  [67, 31],
  [83, 34],
  [100, 40],
];

export interface ReplayTimeline {
  samples: ReplaySamples;
  start: number;
  end: number;
  /** snap[i] is 1 when the segment from sample i to i + 1 must not be interpolated. */
  snap: Uint8Array;
  /** Actual stance per sample (0 stand, 1 crouch, 2 prone), see effectiveStance. */
  stance: Uint8Array;
  /** First sample of the stance run each sample belongs to. */
  stanceStart: Int32Array;
  /** PM_UpdateLean's leanf at each sample's time, see leanAt. */
  lean: Float64Array;
  /** Start times (ms) of melee swings, ascending, see meleeElapsed. */
  meleeStarts: number[];
}

/** Recorder input_mask bits (_replay_record.gsc build_input_mask). */
const INPUT_MELEE = 16;
const INPUT_LEAN_LEFT = 2048;
const INPUT_LEAN_RIGHT = 4096;
const INPUT_IN_AIR = 32768;
/**
 * meleeTime of the viewer's weapon, luger_mp2 (zzz weapons/mp/luger_mp2: 0.7 s), which PM_Weapon
 * (CoD2 1.3 mac:149005) sets as weaponTime on the press. PM_Weapon_CheckForMelee ignores a
 * press while a swing runs and needs a release first (PMF_MELEE).
 */
const MELEE_TIME_MS = 700;

export function createTimeline(samples: ReplaySamples): ReplayTimeline {
  const { pos, t, vel } = samples;
  const count = t.length;
  const snap = new Uint8Array(Math.max(0, count - 1));

  for (let index = 0; index < count - 1; index += 1) {
    const seconds = (t[index + 1] - t[index]) / 1000;
    const distance = Math.hypot(
      pos[index * 3 + 3] - pos[index * 3],
      pos[index * 3 + 4] - pos[index * 3 + 1],
      pos[index * 3 + 5] - pos[index * 3 + 2],
    );
    const speed = Math.max(vectorLength(vel, index), vectorLength(vel, index + 1));
    if (distance > speed * seconds * TELEPORT_SPEED_FACTOR + TELEPORT_SLACK_UNITS) {
      snap[index] = 1;
    }
  }

  // A load marker carries the time of the first sample after the load, so it closes a segment.
  for (const marker of samples.markers) {
    if (marker.kind !== "load") continue;
    let index = findSampleIndex(t, marker.t);
    while (index >= 0 && t[index] >= marker.t) index -= 1;
    if (index >= 0 && index < count - 1) snap[index] = 1;
  }

  const stance = new Uint8Array(count);
  const stanceStart = new Int32Array(count);
  for (let index = 0; index < count; index += 1) {
    stance[index] = effectiveStance(samples, index);
    stanceStart[index] =
      index > 0 && stance[index] === stance[index - 1] ? stanceStart[index - 1] : index;
  }

  const lean = new Float64Array(count);
  for (let index = 1; index < count; index += 1) {
    const before = index - 1;
    lean[index] = leanStep(
      lean[before],
      t[index] - t[before],
      leaning(samples, before),
      stance[before] === 2 ? 0.25 : 0.5,
    );
  }

  return {
    samples,
    start: t[0] ?? 0,
    end: t[count - 1] ?? 0,
    snap,
    stance,
    stanceStart,
    lean,
    meleeStarts: meleeStarts(samples),
  };
}

/**
 * PM_UpdateLean (bg_pmove) over `msec` with the lean keys held still: toward ±max at max per 350 ms,
 * back to 0 at max per 280 ms when released. Linear, so one step equals the game's per-frame steps.
 * ponytail: skips the 8-unit capsule trace that stops a lean at a wall; needs map collision traces.
 */
export function leanStep(leanf: number, msec: number, leaning: number, max: number): number {
  if (leaning > 0) return Math.min(max, leanf + (msec / 350) * max);
  if (leaning < 0) return Math.max(-max, leanf - (msec / 350) * max);
  if (leanf > 0) return Math.max(0, leanf - (msec / 280) * max);
  return Math.min(0, leanf + (msec / 280) * max);
}

/** Lean direction sample `index` asks for: the lean keys count only on the ground. */
function leaning(samples: ReplaySamples, index: number): number {
  const input = samples.input?.[index] ?? 0;
  if (input & INPUT_IN_AIR) return 0;
  return Number((input & INPUT_LEAN_RIGHT) !== 0) - Number((input & INPUT_LEAN_LEFT) !== 0);
}

/** leanf at `time`, stepped from the sample at or before it, so seeking needs no history. */
export function leanAt(timeline: ReplayTimeline, time: number): number {
  const { t } = timeline.samples;
  const index = findSampleIndex(t, time);
  if (index < 0) return 0;
  const max = timeline.stance[index] === 2 ? 0.25 : 0.5;
  const msec = Math.max(0, time - t[index]);
  return leanStep(timeline.lean[index], msec, leaning(timeline.samples, index), max);
}

/**
 * AddLeanToPosition(eye, yaw, leanf, 16, 20): the eye moves 20 units times the lean fraction along
 * the right vector rolled by 16° times it, so a full lean is ~14.7 units sideways and ~3.1 down.
 * CoD2 does not roll the camera itself (CG_CalcViewValues adds no lean to the view angles).
 */
export function addLean(pose: CodPose, leanf: number): CodPose {
  if (leanf === 0) return pose;
  const fraction = leanFraction(leanf);
  const roll = (fraction * 16 * Math.PI) / 180;
  const yaw = (pose.yaw * Math.PI) / 180;
  const distance = fraction * 20;
  // AngleVectors' right vector at pitch 0: (cos r sin y, -cos r cos y, -sin r).
  return {
    ...pose,
    x: pose.x + distance * Math.cos(roll) * Math.sin(yaw),
    y: pose.y - distance * Math.cos(roll) * Math.cos(yaw),
    z: pose.z - distance * Math.sin(roll),
  };
}

/**
 * Melee swing starts: a press (input bit 16) with a weapon out, not within MELEE_TIME_MS of the
 * last swing. ponytail: presses shorter than the 50 ms sample spacing are missed, and reload,
 * raise/drop and grenade states that also block a swing are not recorded.
 */
function meleeStarts(samples: ReplaySamples): number[] {
  const starts: number[] = [];
  const { aux, input, t } = samples;
  if (!input) return starts;
  let held = false;
  for (let index = 0; index < t.length; index += 1) {
    const pressed = (input[index] & INPUT_MELEE) !== 0;
    const armed = (((aux?.[index] ?? 0) >> 1) & 3) < 2;
    const last = starts.at(-1);
    if (pressed && !held && armed && (last === undefined || t[index] - last >= MELEE_TIME_MS)) {
      starts.push(t[index]);
    }
    held = pressed;
  }
  return starts;
}

/** Milliseconds since the latest melee swing started at or before `time`, or null. */
export function meleeElapsed(timeline: ReplayTimeline, time: number): number | null {
  const starts = timeline.meleeStarts;
  const index = findSampleIndex(starts, time);
  return index < 0 || starts[index] > time ? null : time - starts[index];
}

/**
 * The player's actual stance. The recorded stance code follows the crouch/prone keys, while flags
 * bit 1 is getstance() crouching or prone, so a held key the game ignores (or the reverse) does not
 * move the camera. Older payloads without flags use the stance code.
 */
export function effectiveStance(samples: ReplaySamples, index: number): number {
  const code = samples.stance[index];
  if (!samples.flags) return code === 1 || code === 2 ? code : 0;
  if ((samples.flags[index] & 1) === 0) return 0;
  return code === 2 ? 2 : 1;
}

/**
 * Eye height above the feet at `time`, eased like CoD2's PM_ViewHeightAdjust: a stance change starts
 * a table lerp at the first sample in the new stance. Evaluated from the timeline alone, so seeking
 * lands mid-transition correctly. Entering a stance across a load or teleport sets it directly.
 */
export function eyeHeight(timeline: ReplayTimeline, time: number): number {
  const index = findSampleIndex(timeline.samples.t, time);
  return index < 0 ? VIEW_HEIGHT_BY_STANCE[0] : eyeHeightInRun(timeline, index, time, true);
}

function eyeHeightInRun(
  timeline: ReplayTimeline,
  index: number,
  time: number,
  followPrevious: boolean,
): number {
  const runStart = timeline.stanceStart[index];
  const to = timeline.stance[index];
  const end = VIEW_HEIGHT_BY_STANCE[to];
  if (runStart === 0 || timeline.snap[runStart - 1] === 1) return end;
  const from = timeline.stance[runStart - 1];
  const changedAt = timeline.samples.t[runStart];
  const duration = to === 2 || (to === 1 && from === 2) ? 400 : 200;
  const progress = (time - changedAt) / duration;
  if (progress >= 1) return end;
  // ponytail: a change before the previous lerp finished restarts from that lerp's height; the game
  // keeps its own lerp state, which a replay does not record.
  const start = followPrevious
    ? eyeHeightInRun(timeline, runStart - 1, changedAt, false)
    : VIEW_HEIGHT_BY_STANCE[from];
  const table =
    to === 2
      ? VIEW_LERP_CROUCH_PRONE
      : to === 1
        ? from === 2
          ? VIEW_LERP_PRONE_CROUCH
          : VIEW_LERP_STAND_CROUCH
        : VIEW_LERP_CROUCH_STAND;
  // The tables run between fixed heights; remap the curve onto the actual start (stand to prone
  // starts at 60, not the table's 40).
  const tableStart = table[0][1];
  const tableEnd = table[table.length - 1][1];
  const value = tableLerp(table, Math.max(0, progress) * 100);
  return start + ((value - tableStart) * (end - start)) / (tableEnd - tableStart);
}

/** PM_ViewHeightTableLerp: linear between waypoints, by percent of the lerp. */
function tableLerp(table: ViewLerpTable, percent: number): number {
  for (let index = 1; index < table.length; index += 1) {
    const [toPercent, toHeight] = table[index];
    if (percent > toPercent) continue;
    const [fromPercent, fromHeight] = table[index - 1];
    return (
      fromHeight + ((percent - fromPercent) / (toPercent - fromPercent)) * (toHeight - fromHeight)
    );
  }
  return table[table.length - 1][1];
}

/** Feet path as flat xyz endpoint pairs, leaving out the jumps across loads and teleports. */
export function pathSegments(timeline: ReplayTimeline): number[] {
  const { pos } = timeline.samples;
  const segments: number[] = [];
  timeline.snap.forEach((snap, index) => {
    if (!snap) segments.push(...pos.slice(index * 3, index * 3 + 6));
  });
  return segments;
}

/** Index of the last sample at or before `time`, clamped to the first sample. Binary search. */
export function findSampleIndex(t: readonly number[], time: number): number {
  let low = 0;
  let high = t.length - 1;
  if (high < 0) return -1;
  if (time < t[0]) return 0;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (t[middle] <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Cubic Hermite between p0 and p1 with velocity tangents (units/s) over a span of `seconds`. */
export function hermite(
  p0: number,
  v0: number,
  p1: number,
  v1: number,
  s: number,
  seconds: number,
): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * p0 +
    (s3 - 2 * s2 + s) * v0 * seconds +
    (-2 * s3 + 3 * s2) * p1 +
    (s3 - s2) * v1 * seconds
  );
}

/** Interpolates degrees along the shortest arc; the result is wrapped to (-180, 180]. */
export function lerpAngle(from: number, to: number, s: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return wrapDegrees(from + delta * s);
}

/** Eye pose at `time` (ms). Clamped to the replay bounds. */
export function samplePose(timeline: ReplayTimeline, time: number): CodPose {
  const { ang, pos, vel } = timeline.samples;
  const segment = segmentAt(timeline, time);
  if (!segment) return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 };
  const { index, next, s } = segment;
  if (s === null) return poseAt(timeline, index, time);

  const seconds = (timeline.samples.t[next] - timeline.samples.t[index]) / 1000;
  const a = index * 3;
  const b = next * 3;
  return {
    x: hermite(pos[a], vel[a], pos[b], vel[b], s, seconds),
    y: hermite(pos[a + 1], vel[a + 1], pos[b + 1], vel[b + 1], s, seconds),
    z:
      hermite(pos[a + 2], vel[a + 2], pos[b + 2], vel[b + 2], s, seconds) +
      eyeHeight(timeline, time),
    pitch: lerpAngle(ang[a], ang[b], s),
    yaw: lerpAngle(ang[a + 1], ang[b + 1], s),
  };
}

/** Velocity (CoD units/s) at `time`, lerped between samples and held across snaps. */
export function sampleVelocity(timeline: ReplayTimeline, time: number): [number, number, number] {
  const { vel } = timeline.samples;
  const segment = segmentAt(timeline, time);
  if (!segment) return [0, 0, 0];
  const a = segment.index * 3;
  const b = segment.next * 3;
  const { s } = segment;
  if (s === null) return [vel[a], vel[a + 1], vel[a + 2]];
  return [0, 1, 2].map((axis) => vel[a + axis] + (vel[b + axis] - vel[a + axis]) * s) as [
    number,
    number,
    number,
  ];
}

/** Horizontal velocity at `time`, lerped between samples like the pose, with the camera's yaw. */
export function sampleMotion(
  timeline: ReplayTimeline,
  time: number,
): { velX: number; velY: number; yaw: number } {
  const [velX, velY] = sampleVelocity(timeline, time);
  return { velX, velY, yaw: samplePose(timeline, time).yaw };
}

/** Nearest marker strictly after (direction 1) or before (direction -1) `time`, or null. */
export function findMarker(
  markers: readonly ReplayMarker[],
  time: number,
  direction: 1 | -1,
  kinds: readonly ReplayMarkerKind[],
): ReplayMarker | null {
  const candidates = markers.filter((marker) => kinds.includes(marker.kind));
  if (direction === 1) return candidates.find((marker) => marker.t > time + 1) ?? null;
  return candidates.reverse().find((marker) => marker.t < time - 1) ?? null;
}

/** Formats elapsed replay time as mm:ss.cc. */
export function formatReplayClock(ms: number): string {
  const centiseconds = Math.max(0, Math.floor(ms / 10));
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = Math.floor(centiseconds / 100) % 60;
  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds % 100)}`;
}

/** Sample `index` at or before `time`, and how far toward the next (null: hold, do not blend). */
function segmentAt(
  timeline: ReplayTimeline,
  time: number,
): { index: number; next: number; s: number | null } | null {
  const { t } = timeline.samples;
  const index = findSampleIndex(t, time);
  if (index < 0) return null;
  const next = index + 1;
  const span = next < t.length ? t[next] - t[index] : 0;
  if (span <= 0 || timeline.snap[index] === 1 || time <= t[index]) return { index, next, s: null };
  return { index, next, s: Math.min(1, (time - t[index]) / span) };
}

function poseAt(timeline: ReplayTimeline, index: number, time: number): CodPose {
  const { samples } = timeline;
  const a = index * 3;
  return {
    x: samples.pos[a],
    y: samples.pos[a + 1],
    z: samples.pos[a + 2] + eyeHeight(timeline, time),
    pitch: samples.ang[a],
    yaw: samples.ang[a + 1],
  };
}

function vectorLength(values: readonly number[], index: number): number {
  return Math.hypot(values[index * 3], values[index * 3 + 1], values[index * 3 + 2]);
}

function wrapDegrees(value: number): number {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
