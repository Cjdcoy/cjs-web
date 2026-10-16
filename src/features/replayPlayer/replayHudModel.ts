import type { ReplayMarker, ReplaySamples, ReplaySkip } from "../../lib/api";
import type { CodPose } from "../mapViewer";

/**
 * Server g_speed for the angle helper. The replay does not record it.
 * ponytail: fixed at the codjumper default 190; defrag servers use 320. Take it from the payload
 * if the recorder ever stores it.
 */
export const G_SPEED = 190;
/** FPS the angle helper assumes when neither an fps marker nor the run FPS is known. */
const DEFAULT_HELPER_FPS = 125;

/** HUD positions in CoD's 640×480 virtual screen, relative to the centre (_hud_editor.gsc). */
export const HUD_ANGLE_HELPER_Y = 30;
export const HUD_SPEED_METER_Y = 50;
/** hud.menu's replay_jumptimer_text. */
export const HUD_JUMP_TIMER_Y = -30;

const RADIANS = Math.PI / 180;
const FLAG_IN_AIR = 4;
const INPUT_FORWARD = 32;
const INPUT_BACK = 64;
const INPUT_LEFT = 128;
const INPUT_RIGHT = 256;

/** 0 hidden (on ground), 1 centre marker only, 2 full helper, as anglehelper_apply. */
export type AngleHelperDisplay = 0 | 1 | 2;

/**
 * Angle helper edges in degrees right of the view direction, unrounded. The mod draws a line at each
 * deadzone edge and a bar from each deadzone edge out to its gain limit; it truncates these to whole
 * HUD units and clamps bar sizes to 2..90 only because of CoD's HUD system.
 */
export interface AngleHelperState {
  display: AngleHelperDisplay;
  deadzoneLeft: number;
  deadzoneRight: number;
  gainLimitLeft: number;
  gainLimitRight: number;
}

/** Where the current view (offset 0) sits: gaining speed, in the deadzone, or past the gain limit. */
export type AngleHelperZone = "gain" | "deadzone" | "loss";

export interface AngleHelperInput {
  onGround: boolean;
  /** right − left, in −1..1. */
  strafe: number;
  /** forward − back, in −1..1. */
  forward: number;
  velX: number;
  velY: number;
  /** Degrees, CoD convention. */
  yaw: number;
  fps: number | null;
  gSpeed?: number;
}

const COLLAPSED: Omit<AngleHelperState, "display"> = {
  deadzoneLeft: 0,
  deadzoneRight: 0,
  gainLimitLeft: 0,
  gainLimitRight: 0,
};

/** anglehelper_apply (_jumpmod.gsc) without the HUD's integer rounding, centred at 0. */
export function angleHelper(input: AngleHelperInput): AngleHelperState {
  if (input.onGround) return { display: 0, ...COLLAPSED };
  if (input.strafe === 0 && input.forward === 0) return { display: 1, ...COLLAPSED };
  const speed2d = Math.hypot(input.velX, input.velY);
  if (speed2d <= 100) return { display: 1, ...COLLAPSED };

  const s = input.gSpeed ?? G_SPEED;
  const fps = input.fps && input.fps > 0 ? input.fps : DEFAULT_HELPER_FPS;
  const speedRatio = (s - s / fps) / speed2d;
  if (speedRatio >= 1) return { display: 1, ...COLLAPSED };

  const yaw = input.yaw * RADIANS;
  // anglestoright((0, yaw, 0)) * strafe + anglestoforward((0, yaw, 0)) * forward, normalized.
  const wishX = Math.sin(yaw) * input.strafe + Math.cos(yaw) * input.forward;
  const wishY = -Math.cos(yaw) * input.strafe + Math.sin(yaw) * input.forward;
  const wishLength = Math.hypot(wishX, wishY);
  const dot = (wishX * input.velX + wishY * input.velY) / (wishLength * speed2d);
  const dopt = Math.acos(speedRatio) / RADIANS;
  const d = Math.acos(Math.min(1, Math.max(-1, dot))) / RADIANS;
  const sign = input.strafe > 0 ? -1 : 1;
  const deadzone1 = (d - dopt) * sign;
  const deadzone2 = (d + dopt) * sign;
  const gainLimit1 = (d - 90) * sign;
  const gainLimit2 = (d + 90) * sign;

  return {
    display: 2,
    deadzoneLeft: Math.min(deadzone1, deadzone2),
    deadzoneRight: Math.max(deadzone1, deadzone2),
    gainLimitLeft: Math.min(gainLimit1, gainLimit2),
    gainLimitRight: Math.max(gainLimit1, gainLimit2),
  };
}

/** Zone of the current view direction, for colouring the centre line. */
export function angleHelperZone(state: AngleHelperState): AngleHelperZone {
  if (state.deadzoneLeft < 0 && 0 < state.deadzoneRight) return "deadzone";
  if (state.gainLimitLeft <= 0 && 0 < state.gainLimitRight) return "gain";
  return "loss";
}

export interface ReplayMotion {
  velX: number;
  velY: number;
  /** Degrees, the yaw the camera shows. */
  yaw: number;
}

/**
 * Angle helper fed like replay_anglehelper_update: move keys, ground state, and fps from sample
 * `index`, velocity and yaw from the interpolated `motion` the camera shows. Null when the replay has
 * no flags or input recorded.
 */
export function angleHelperAt(
  samples: ReplaySamples,
  index: number,
  fps: number | null,
  motion: ReplayMotion,
): AngleHelperState | null {
  const { flags, input } = samples;
  if (!flags || !input || index < 0 || index >= flags.length) return null;
  const mask = input[index];
  return angleHelper({
    onGround: (flags[index] & FLAG_IN_AIR) === 0,
    strafe: Number((mask & INPUT_RIGHT) !== 0) - Number((mask & INPUT_LEFT) !== 0),
    forward: Number((mask & INPUT_FORWARD) !== 0) - Number((mask & INPUT_BACK) !== 0),
    ...motion,
    fps,
  });
}

/**
 * Replay key display on hud.menu's replay_key_* grid: 20×20 cells with 2-unit gaps centred at
 * y = 105/127/149 below the screen centre, laid out like a keyboard. Space spans A–D exactly; C and
 * Ctrl take one cell each beside it. Pressed keys draw bright (alpha 0.9), released ones dim (0.2),
 * like the menu's forecolors.
 */
export const REPLAY_KEYS = [
  { id: "forward", label: "W", bit: 32, x: 0, y: 105, width: 20 },
  { id: "left", label: "A", bit: 128, x: -22, y: 127, width: 20 },
  { id: "back", label: "S", bit: 64, x: 0, y: 127, width: 20 },
  { id: "right", label: "D", bit: 256, x: 22, y: 127, width: 20 },
  { id: "crouch", label: "C", bit: 8192, x: -44, y: 149, width: 20 },
  { id: "jump", label: "Space", bit: 2, x: 0, y: 149, width: 64 },
  { id: "prone", label: "Ctrl", bit: 16384, x: 44, y: 149, width: 20 },
] as const;

/** True while sample `index` has no active weapon (aux weapon state 3), as when climbing ladders. */
export function weaponHolstered(samples: ReplaySamples, index: number): boolean {
  const aux = samples.aux?.[index];
  return aux !== undefined && ((aux >> 1) & 3) === 3;
}

/** Which REPLAY_KEYS sample `index` holds down, in order; null without recorded input. */
export function keysAt(samples: ReplaySamples, index: number): boolean[] | null {
  const mask = samples.input?.[index];
  if (mask === undefined) return null;
  return REPLAY_KEYS.map((key) => (mask & key.bit) !== 0);
}

export type SpeedTrend = "up" | "down" | "same";

/** Speed meter for sample `index`: int(length2d(vel)) and its change from the previous sample. */
export function speedAt(
  samples: ReplaySamples,
  index: number,
): { value: number; trend: SpeedTrend } {
  const value = speed2d(samples, index);
  const previous = index > 0 ? speed2d(samples, index - 1) : value;
  return { value, trend: value > previous ? "up" : value < previous ? "down" : "same" };
}

/** Configured FPS at `time`: the last fps marker, else the run FPS. Null when unknown. */
export function fpsAt(samples: ReplaySamples, time: number): number | null {
  let fps: number | undefined;
  let found = false;
  for (const marker of samples.markers) {
    if (marker.t > time) break;
    if (marker.kind !== "fps") continue;
    found = true;
    fps = marker.fps;
  }
  // An fps marker without a value means unknown, which falls back to the run FPS like in-game.
  if (!found || fps === undefined) fps = samples.run_fps;
  return fps && fps > 0 ? fps : null;
}

/**
 * The skip window to fire at playback time `now`, as the in-game auto-skip: playing forward with
 * start_t <= now < target_t. A window the viewer seeked into (`seekTime` past its start) never fires,
 * so rewinding into a failed attempt shows it.
 */
export function findAutoSkip(
  skips: readonly ReplaySkip[],
  now: number,
  seekTime: number | null,
): ReplaySkip | null {
  const skip = skips.find((window) => window.start_t <= now && now < window.target_t);
  if (!skip) return null;
  // Seeking to the window's start (for example the save that begins it) still skips, as in-game.
  if (seekTime !== null && skip.start_t < seekTime && seekTime < skip.target_t) return null;
  return skip;
}

/** Fails a skip fired at `now` jumps over: the load markers with now < t <= target_t. */
export function skippedLoadCount(
  markers: readonly ReplayMarker[],
  now: number,
  target: number,
): number {
  return markers.filter((marker) => marker.kind === "load" && marker.t > now && marker.t <= target)
    .length;
}

/** Records an executed skip, keeping the highest fail count per target like in-game. */
export function recordSkip(
  executed: ReadonlyMap<number, number>,
  target: number,
  fails: number,
): ReadonlyMap<number, number> {
  if ((executed.get(target) ?? -1) >= fails) return executed;
  return new Map(executed).set(target, fails);
}

/** "Skipped N fails": executed skips whose target is at or before `now`, so rewinding lowers it. */
export function skippedFails(executed: ReadonlyMap<number, number>, now: number): number {
  let total = 0;
  for (const [target, fails] of executed) if (target <= now) total += fails;
  return total;
}

/**
 * poshud lines (_measure.gsc poshudtext): the feet origin "x y z", then "pitch yaw roll", each
 * truncated toward zero to two decimals. The mod splices a "." into int(value * 100), which breaks
 * values under 1; these are printed properly instead. Replays have no roll, as in-game.
 */
export function positionHudLines(feet: CodPose): [string, string] {
  const format = (values: readonly number[]) =>
    values
      // toPrecision drops float noise such as 0.29 * 100 = 28.999999999999996 before truncating.
      .map((value) => (Math.trunc(Number((value * 100).toPrecision(12))) / 100).toFixed(2))
      .join(" ");
  return [format([feet.x, feet.y, feet.z]), format([feet.pitch, feet.yaw, 0])];
}

/**
 * Jump timer (replay_jumptimer_update) at playback `time`: seconds airborne (flags bit 4) truncated
 * to 0.1, timed from the first sample of the current airborne stretch so a seek lands on the right
 * value, and 0 on the ground. Null when the replay has no flags.
 */
export function jumpTimerAt(samples: ReplaySamples, index: number, time: number): number | null {
  const { flags, t } = samples;
  if (!flags || index < 0 || index >= flags.length) return null;
  if ((flags[index] & FLAG_IN_AIR) === 0) return 0;
  let start = index;
  while (start > 0 && (flags[start - 1] & FLAG_IN_AIR) !== 0) start -= 1;
  return Math.max(0, Math.trunc((time - t[start]) / 100) / 10);
}

function speed2d(samples: ReplaySamples, index: number): number {
  return Math.trunc(Math.hypot(samples.vel[index * 3], samples.vel[index * 3 + 1]));
}
