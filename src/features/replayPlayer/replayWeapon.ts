import { eyeHeight, findSampleIndex, type ReplayTimeline } from "./replayPlayback";

/*
 * First-person gun motion that CoD2 keeps as per-frame client state, rebuilt from the samples.
 * Every tracker in the game steps `cur += (target - cur) · rate · frametime` (DiffTrack, com_math.cpp
 * :638; CG_AddViewWeapon's own copy). With the target held over a sample span that is
 * `target + (cur - target) · e^(-rate · seconds)` in the per-frame limit, so the state is stored per
 * sample and stepped from the one at or before `time`: seeking needs no history.
 *
 * Weapon values are luger_mp2's, the viewmodel the player draws (mapModels VIEWMODEL_WEAPON), read
 * from the J4L weapon file (zzz_JH2055.iwd weapons/mp/luger_mp2, the same bytes as
 * jump4life/mods/cod2/zzz/weapons/mp/luger_mp2). Field order is WeaponDef's (CoD2rev bg_public.h
 * :479-512), which CoD2 1.3 indexes as weapDef[75..103] in CG_AddViewWeapon.
 */

/** By stance (0 stand, 1 crouch, 2 prone): standMoveF/R/U, duckedMoveF/R/U, proneMoveF/R/U. */
const MOVE = [
  [0, 1, -1.25],
  [0, 0.75, -1.5],
  [5, -75, -105],
] as const;
/** standRotP/Y/R, duckedRotP/Y/R, proneRotP/Y/R. */
const ROT = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 220, -300],
] as const;
/** Stance offset by viewHeightTarget: none at 60, duckedOfsF/R/U at 40, proneOfsF/R/U at 11. */
const OFS = [
  [0, 0, 0],
  [-2, 1, -0.2],
  [-1, 2.5, 0.8],
] as const;
/** standMoveMinSpeed, duckedMoveMinSpeed, proneMoveMinSpeed (+ cg_gun_move_minspeed 0). */
const MOVE_MIN_SPEED = [80, 20, 0] as const;
/** standRotMinSpeed, duckedRotMinSpeed, proneRotMinSpeed. */
const ROT_MIN_SPEED = [80, 20, 0] as const;
/** posMoveRate / posProneMoveRate (+ cg_gun_move_rate 0), posRotRate / posProneRotRate. */
const POS_MOVE_RATE = 6;
const POS_PRONE_MOVE_RATE = 25;
const POS_ROT_RATE = 7;
const POS_PRONE_ROT_RATE = 35;
/** swayMaxAngle, swayLerpSpeed, swayPitchScale, swayYawScale, swayHorizScale, swayVertScale. */
const SWAY_MAX_ANGLE = 3;
const SWAY_LERP_SPEED = 7;
const SWAY_PITCH_SCALE = 0.1;
const SWAY_YAW_SCALE = 0.1;
const SWAY_HORIZ_SCALE = 0.16;
const SWAY_VERT_SCALE = 0.18;

/**
 * ps->speed is g_speed (g_active_mp.cpp:1293; CoD2 default 190, mac:327041). J4L sets 190 in
 * codjumper (_jumpstracking.gsc:195). ponytail: os_mode (210) and other gametypes are not recorded.
 */
const PLAYER_SPEED = 190;
/** g_gravity default (mac:327042; libcod2 dvar.cpp:336). */
const GRAVITY = 800;
const PRONE_VIEWHEIGHT = 11;

/** Recorder bits: flags 4 airborne (append_flags), aux weapon slot (aux >> 1) & 3. */
const FLAG_IN_AIR = 4;

/**
 * Per-sample tracker state, STATE floats each: vLastMoveOrg F/L/U (CG_AddViewWeapon, cg+165032),
 * vLastMoveAng P/Y/R (BG_CalculateWeaponPosition_BasePosition_angles), swayOffset[1], swayOffset[2],
 * swayAngles[0], swayAngles[1] (BG_CalculateWeaponPosition_Sway).
 */
const STATE = 10;
/**
 * Most tracker states kept. A longer replay stores every `stride`-th sample's state and steps the
 * rest on demand (at most stride - 1 spans per frame), so a 2M-sample replay needs ~8 MB, not 80.
 */
const MAX_STATES = 200_000;

export interface WeaponTrack {
  timeline: ReplayTimeline;
  /** Tracker state at every `stride`-th sample. */
  state: Float32Array;
  stride: number;
  /** Landing times (ms) and their landChange (negative units), ascending. */
  landTimes: number[];
  landChanges: number[];
  /** Weapon raise (pullout) start times, ascending. */
  raises: number[];
}

export interface WeaponFrame {
  /** View landing dip to add to the eye height, CoD units (≤ 0). */
  dip: number;
  /** Gun offset along the view's forward, left and up axes, CoD units. */
  offset: [number, number, number];
  /** Gun pitch, yaw and roll relative to the view, degrees, before the lean roll. */
  angles: [number, number, number];
  /** Milliseconds since the latest raise started, or null. */
  raiseMs: number | null;
}

export function createWeaponTrack(timeline: ReplayTimeline): WeaponTrack {
  const { samples } = timeline;
  const { aux, t } = samples;
  const count = t.length;
  const stride = Math.max(1, Math.ceil(count / MAX_STATES));
  const state = new Float32Array(Math.ceil(count / stride) * STATE);
  const current = new Array<number>(STATE).fill(0);
  for (let index = 1; index < count; index += 1) {
    step(timeline, index - 1, current);
    if (index % stride === 0) state.set(current, (index / stride) * STATE);
  }

  const landTimes: number[] = [];
  const landChanges: number[] = [];
  const raises: number[] = [];
  for (let index = 1; index < count; index += 1) {
    const before = index - 1;
    if (timeline.snap[before] === 1) continue;
    const landing = landingAt(timeline, before, index);
    if (landing) {
      landTimes.push(landing.time);
      landChanges.push(landing.change);
    }
    if (aux) {
      const from = (aux[before] >> 1) & 3;
      const into = (aux[index] >> 1) & 3;
      // PM_FinishWeaponChange starts WEAP_RAISE for a new weapon after a putaway or none (ladder,
      // mantle). ponytail: from the grenade slot is skipped; an offhand end is a quickRaise (10 ms).
      if (into !== from && into <= 1 && from !== 2) raises.push(t[index]);
    }
  }
  return { timeline, state, stride, landTimes, landChanges, raises };
}

/** Steps tracker state `s` over the span from sample `index` to the next. */
function step(timeline: ReplayTimeline, index: number, s: number[]): void {
  const { t } = timeline.samples;
  const { target, rate } = segment(timeline, index);
  const seconds = (t[index + 1] - t[index]) / 1000;
  for (let k = 0; k < STATE; k += 1) s[k] = diffTrack(s[k], target[k], rate[k], seconds);
}

/** The gun's tracked motion and the view's landing dip at `time`, for a view `pitch` (degrees). */
export function weaponAt(track: WeaponTrack, time: number, pitch: number): WeaponFrame {
  const { t } = track.timeline.samples;
  const index = findSampleIndex(t, time);
  const s = new Array<number>(STATE).fill(0);
  if (index >= 0) {
    const stored = Math.floor(index / track.stride);
    for (let k = 0; k < STATE; k += 1) s[k] = track.state[stored * STATE + k];
    for (let from = stored * track.stride; from < index; from += 1) step(track.timeline, from, s);
    const { target, rate } = segment(track.timeline, index);
    const seconds = Math.max(0, time - t[index]) / 1000;
    for (let k = 0; k < STATE; k += 1) {
      s[k] = diffTrack(s[k], target[k], rate[k], seconds);
    }
  }
  const dip = landDip(track, time);
  // CG_AddViewWeapon adds landChange × 0.25 on the same ramp to the gun's world z (mac:352978-352990).
  const gunDip = 0.25 * dip;
  const p = (pitch * Math.PI) / 180;
  return {
    dip,
    // Base position, minus swayOffset[1] on left and plus swayOffset[2] on up (mac:352963-352965);
    // world z on the view axes is (-sin p, 0, cos p).
    offset: [s[0] - Math.sin(p) * gunDip, s[1] - s[6], s[2] + s[7] + Math.cos(p) * gunDip],
    // BG_CalculateWeaponAngles: angles[0..1] = AngleSubtract(angles, swayAngles).
    angles: [s[3] - s[8], s[4] - s[9], s[5]],
    raiseMs: elapsed(track.raises, time),
  };
}

/**
 * Targets and rates (per second) of every tracker over the span from sample `index` to the next.
 * CG_AddViewWeapon (mac:352805-352950): speedFrac = (xyspeed - min) / (ps->speed - min) clamped to
 * [0, 1] above the stance's min speed, else 0; target = stance Move × speedFrac + the stance offset
 * for viewHeightTarget 40 / 11; rate posProneMoveRate while viewHeightCurrent is 11. The angles are
 * BasePosition_angles (bg_weapons.cpp:2289-2378) with Rot / RotMinSpeed / posRotRate. Sway
 * (bg_weapons.cpp:1331-1388) clamps the view's angular speed in degrees per 1/60 s to ±swayMaxAngle.
 * ponytail: the 0.1 units/s minimum step and the reload exception (weaponstate 5) are left out.
 */
function segment(timeline: ReplayTimeline, index: number): { target: number[]; rate: number[] } {
  const { ang, t, vel } = timeline.samples;
  const stance = timeline.stance[index] ?? 0;
  const speed = Math.hypot(vel[index * 3], vel[index * 3 + 1]);
  const move = speedFraction(speed, MOVE_MIN_SPEED[stance]);
  const rot = speedFraction(speed, ROT_MIN_SPEED[stance]);
  const prone = eyeHeight(timeline, t[index]) === PRONE_VIEWHEIGHT;

  let pitchSpeed = 0;
  let yawSpeed = 0;
  const next = index + 1;
  if (next < t.length && timeline.snap[index] === 0 && t[next] > t[index]) {
    // AnglesSubtract over the span, scaled by 1 / (dt · 60).
    const scale = 1000 / ((t[next] - t[index]) * 60);
    pitchSpeed = clamp(angleDelta(ang[next * 3], ang[index * 3]) * scale, SWAY_MAX_ANGLE);
    yawSpeed = clamp(angleDelta(ang[next * 3 + 1], ang[index * 3 + 1]) * scale, SWAY_MAX_ANGLE);
  }

  const posRate = prone ? POS_PRONE_MOVE_RATE : POS_MOVE_RATE;
  const rotRate = prone ? POS_PRONE_ROT_RATE : POS_ROT_RATE;
  return {
    target: [
      MOVE[stance][0] * move + OFS[stance][0],
      MOVE[stance][1] * move + OFS[stance][1],
      MOVE[stance][2] * move + OFS[stance][2],
      ROT[stance][0] * rot,
      ROT[stance][1] * rot,
      ROT[stance][2] * rot,
      yawSpeed * SWAY_HORIZ_SCALE,
      pitchSpeed * SWAY_VERT_SCALE,
      pitchSpeed * SWAY_PITCH_SCALE,
      yawSpeed * SWAY_YAW_SCALE,
    ],
    rate: [
      posRate,
      posRate,
      posRate,
      rotRate,
      rotRate,
      rotRate,
      SWAY_LERP_SPEED,
      SWAY_LERP_SPEED,
      SWAY_LERP_SPEED,
      SWAY_LERP_SPEED,
    ],
  };
}

/** DiffTrack held for `seconds`, in the per-frame limit. */
export function diffTrack(current: number, target: number, rate: number, seconds: number): number {
  return target + (current - target) * Math.exp(-rate * seconds);
}

function speedFraction(speed: number, minSpeed: number): number {
  if (speed <= minSpeed) return 0;
  return Math.min(1, Math.max(0, (speed - minSpeed) / (PLAYER_SPEED - minSpeed)));
}

/**
 * PM_CrashLand (bg_pmove.cpp:3169-3290) between airborne sample `before` and grounded `index`.
 * The impact speed follows from the last airborne height and vertical speed under gravity, so
 * fallHeight = vz² / 2g + drop and the landing time solves the same parabola. A hard landing
 * (fallHeight ≥ 12) sends viewDip = (fallHeight - 12) / 26 × 4 + 4, truncated and capped at 24
 * (0 up to 12), and CG_EntityEvent sets landChange = -viewDip, landTime = now (mac:358815-358853). A
 * damaging fall recomputes the dip from the damage (mac:358836-358853): with the default
 * bg_fallDamageMinHeight 256 (mac:136145) that is always the 24 cap.
 */
export function landingAt(
  timeline: ReplayTimeline,
  before: number,
  index: number,
): { time: number; change: number } | null {
  const { flags, pos, t, vel } = timeline.samples;
  if (!flags || (flags[before] & FLAG_IN_AIR) === 0 || (flags[index] & FLAG_IN_AIR) !== 0) {
    return null;
  }
  const vz = vel[before * 3 + 2];
  const drop = pos[before * 3 + 2] - pos[index * 3 + 2];
  const impact = vz * vz + 2 * GRAVITY * drop;
  if (impact < 0) return null;
  const fallHeight = impact / (2 * GRAVITY);
  if (fallHeight < 12) return null;
  const viewDip = fallHeight <= 12 ? 0 : Math.min(24, Math.trunc(((fallHeight - 12) / 26) * 4 + 4));
  const seconds = (vz + Math.sqrt(impact)) / GRAVITY;
  const time = Math.min(t[index], t[before] + Math.max(0, seconds * 1000));
  return { time, change: -viewDip };
}

/**
 * CG_CalcViewValues' landing ramp (mac:349272-349303): landChange × delta / 150 over the first
 * 150 ms, back to 0 over the next 300.
 */
function landDip(track: WeaponTrack, time: number): number {
  const index = findSampleIndex(track.landTimes, time);
  if (index < 0 || track.landTimes[index] > time) return 0;
  const delta = time - track.landTimes[index];
  const change = track.landChanges[index];
  if (delta < 150) return (change * delta) / 150;
  if (delta < 450) return change * (1 - (delta - 150) / 300);
  return 0;
}

function elapsed(starts: number[], time: number): number | null {
  const index = findSampleIndex(starts, time);
  return index < 0 || starts[index] > time ? null : time - starts[index];
}

/** AnglesSubtract: a - b wrapped to [-180, 180). */
function angleDelta(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
