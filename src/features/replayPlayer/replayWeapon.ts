import type { ViewmodelAnim, ViewmodelFlash } from "../mapViewer";
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
/**
 * swayMaxAngle, swayLerpSpeed, swayPitchScale, swayYawScale, swayHorizScale, swayVertScale, then the
 * adsSway* values BG_CalculateWeaponPosition_Sway lerps them toward by fWeaponPosFrac.
 */
const SWAY = [3, 7, 0.1, 0.1, 0.16, 0.18] as const;
const ADS_SWAY = [4, 6, 0.1, 0.1, 0.15, 0.24] as const;
/**
 * Gun kick (BG_WeaponFireRecoil, BG_CalculateWeaponPosition_GunRecoil): hip and ads GunKickPitchMin/
 * Max, GunKickYawMin/Max, GunKickAccel, GunKickSpeedMax, GunKickSpeedDecay, GunKickStaticDecay.
 */
const HIP_KICK = [-30, -35, -2, 18, 1000, 1200, 100, 2] as const;
const ADS_KICK = [-100, -100, -20, 18, 520, 2000, 25, 50] as const;
/** gunMaxPitch, gunMaxYaw: the kick's angle caps. */
const GUN_MAX = [2, 6] as const;

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
 * swayAngles[0], swayAngles[1] (BG_CalculateWeaponPosition_Sway), then vGunOffset pitch/yaw and
 * vGunSpeed pitch/yaw (the gun kick). The first TRACKED follow DiffTrack.
 */
const STATE = 14;
const TRACKED = 10;
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
}

export interface WeaponFrame {
  /** View landing dip to add to the eye height, CoD units (≤ 0). */
  dip: number;
  /** Gun offset along the view's forward, left and up axes, CoD units. */
  offset: [number, number, number];
  /** Gun pitch, yaw and roll relative to the view, degrees, before the lean roll. */
  angles: [number, number, number];
}

export function createWeaponTrack(timeline: ReplayTimeline): WeaponTrack {
  const { t } = timeline.samples;
  const count = t.length;
  const stride = Math.max(1, Math.ceil(count / MAX_STATES));
  const state = new Float32Array(Math.ceil(count / stride) * STATE);
  const current = new Array<number>(STATE).fill(0);
  if (count > 0) kick(timeline, Number.NEGATIVE_INFINITY, t[0], current);
  state.set(current);
  for (let index = 1; index < count; index += 1) {
    step(timeline, index - 1, current);
    if (index % stride === 0) state.set(current, (index / stride) * STATE);
  }

  const landTimes: number[] = [];
  const landChanges: number[] = [];
  for (let index = 1; index < count; index += 1) {
    if (timeline.snap[index - 1] === 1) continue;
    const landing = landingAt(timeline, index - 1, index);
    if (landing) {
      landTimes.push(landing.time);
      landChanges.push(landing.change);
    }
  }
  return { timeline, state, stride, landTimes, landChanges };
}

/** Steps tracker state `s` over the span from sample `index` to the next, ending with its shots. */
function step(timeline: ReplayTimeline, index: number, s: number[]): void {
  const { t } = timeline.samples;
  advance(timeline, index, (t[index + 1] - t[index]) / 1000, s);
  kick(timeline, t[index], t[index + 1], s);
}

/** Moves `s` on from sample `index` by `seconds` with that sample's targets. */
function advance(timeline: ReplayTimeline, index: number, seconds: number, s: number[]): void {
  const { target, rate } = segment(timeline, index);
  for (let k = 0; k < TRACKED; k += 1) s[k] = diffTrack(s[k], target[k], rate[k], seconds);
  gunRecoil(s, seconds, timeline.ads[index]);
}

/**
 * The gun's tracked motion and the view's landing dip at `time`, for a view `pitch` (degrees) and
 * fWeaponPosFrac `frac` (adsAt).
 */
export function weaponAt(
  track: WeaponTrack,
  time: number,
  pitch: number,
  frac: number,
): WeaponFrame {
  const { timeline } = track;
  const { t } = timeline.samples;
  const index = findSampleIndex(t, time);
  const s = new Array<number>(STATE).fill(0);
  if (index >= 0) {
    const stored = Math.floor(index / track.stride);
    for (let k = 0; k < STATE; k += 1) s[k] = track.state[stored * STATE + k];
    for (let from = stored * track.stride; from < index; from += 1) step(timeline, from, s);
    advance(timeline, index, Math.max(0, time - t[index]) / 1000, s);
  }
  const dip = landDip(track, time);
  // CG_AddViewWeapon adds landChange × 0.25 on the same ramp to the gun's world z (mac:352978-352990).
  const gunDip = 0.25 * dip;
  const p = (pitch * Math.PI) / 180;
  // The move offset and angles fade out over the first half of ADS (fWeaponPosFrac `frac`,
  // mac:352936-352957 and 147204-147215); sway and the kick stay.
  const move = frac === 0 ? 1 : frac < 0.5 ? 1 - 2 * frac : 0;
  return {
    dip,
    // Base position, minus swayOffset[1] on left and plus swayOffset[2] on up (mac:352963-352965);
    // world z on the view axes is (-sin p, 0, cos p).
    offset: [
      s[0] * move - Math.sin(p) * gunDip,
      s[1] * move - s[6],
      s[2] * move + s[7] + Math.cos(p) * gunDip,
    ],
    // BG_CalculateWeaponAngles: angles[0..1] = AngleSubtract(angles, swayAngles), plus vGunOffset.
    angles: [s[3] * move - s[8] + s[10], s[4] * move - s[9] + s[11], s[5] * move],
  };
}

/**
 * BG_WeaponFireRecoil (bg_weapons.cpp:815-858) for the shots in (from, to]: vGunSpeed gains a kick
 * picked in the ads range once fWeaponPosFrac is above 0, else the hip range. The
 * ReducedKickBullets are 0, so no kick is reduced. The view kick (kickAVel) is not added: CL_CreateCmd
 * folds the kick angles into the usercmd angles (mac:302643-302647, CG_DrawActive mac:345708), so the
 * recorded view angles already carry it.
 */
function kick(timeline: ReplayTimeline, from: number, to: number, s: number[]): void {
  const { fireFrac, fireStarts } = timeline;
  for (let shot = findSampleIndex(fireStarts, to); shot >= 0; shot -= 1) {
    if (fireStarts[shot] > to || fireStarts[shot] <= from) break;
    const range = fireFrac[shot] > 0 ? ADS_KICK : HIP_KICK;
    s[12] += range[0] + random(shot * 16) * (range[1] - range[0]);
    s[13] += range[2] + random(shot * 16 + 1) * (range[3] - range[2]);
  }
}

/**
 * BG_CalculateWeaponPosition_GunRecoil (bg_weapons.cpp:4136-4222): the kick's accel, speed cap and
 * decays lerp from hip to ads by fWeaponPosFrac, integrated in 5 ms steps until both axes rest.
 */
export function gunRecoil(s: number[], seconds: number, frac: number): void {
  const lerp = (k: number) => HIP_KICK[k] + (ADS_KICK[k] - HIP_KICK[k]) * frac;
  const params = [lerp(4), lerp(5), lerp(6), lerp(7)] as const;
  for (let total = seconds; total > 0; total -= 0.005) {
    const dt = total > 0.005 ? 0.0049999999 : total;
    const pitchStill = kickAxis(s, 10, dt, GUN_MAX[0], params);
    if (kickAxis(s, 11, dt, GUN_MAX[1], params) && pitchStill) break;
  }
}

/** BG_CalculateWeaponPosition_GunRecoil_SingleAngle on s[k] (offset) and s[k + 2] (speed). */
function kickAxis(
  s: number[],
  k: number,
  dt: number,
  cap: number,
  [accel, speedMax, speedDecay, staticDecay]: readonly [number, number, number, number],
): boolean {
  if (Math.abs(s[k]) < 0.25 && Math.abs(s[k + 2]) < 1) {
    s[k] = 0;
    s[k + 2] = 0;
    return true;
  }
  let offset = s[k] + s[k + 2] * dt;
  let speed = s[k + 2];
  if (offset > cap) {
    offset = cap;
    speed = Math.min(speed, 0);
  } else if (offset < -cap) {
    offset = -cap;
    speed = Math.max(speed, 0);
  }
  if (offset > 0) speed -= accel * dt;
  else if (offset < 0) speed += accel * dt;
  speed -= speed * speedDecay * dt;
  speed = speed > 0 ? Math.max(0, speed - staticDecay * dt) : Math.min(0, speed + staticDecay * dt);
  s[k] = offset;
  s[k + 2] = Math.max(-speedMax, Math.min(speedMax, speed));
  return false;
}

/**
 * randomf() for the kick. shortcut: the game's random draw is not recorded, so a hash of the shot
 * number stands in and every viewing shows the same kicks; exact needs the server's seed.
 */
function random(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Targets and rates (per second) of every tracker over the span from sample `index` to the next.
 * CG_AddViewWeapon (mac:352805-352950): speedFrac = (xyspeed - min) / (ps->speed - min) clamped to
 * [0, 1] above the stance's min speed, else 0; target = stance Move × speedFrac + the stance offset
 * for viewHeightTarget 40 / 11; rate posProneMoveRate while viewHeightCurrent is 11. The angles are
 * BasePosition_angles (bg_weapons.cpp:2289-2378) with Rot / RotMinSpeed / posRotRate, the target
 * scaled by 1 - fWeaponPosFrac (mac:147160-147167). Sway (bg_weapons.cpp:1331-1388) clamps the
 * view's angular speed in degrees per 1/60 s to ±swayMaxAngle, every sway value lerped to its
 * adsSway* by fWeaponPosFrac.
 * ponytail: the 0.1 units/s minimum step and the reload exception (weaponstate 5) are left out.
 */
function segment(timeline: ReplayTimeline, index: number): { target: number[]; rate: number[] } {
  const { ang, t, vel } = timeline.samples;
  const stance = timeline.stance[index] ?? 0;
  const speed = Math.hypot(vel[index * 3], vel[index * 3 + 1]);
  const frac = timeline.ads[index];
  const move = speedFraction(speed, MOVE_MIN_SPEED[stance]);
  const rot = speedFraction(speed, ROT_MIN_SPEED[stance]) * (1 - frac);
  const prone = eyeHeight(timeline, t[index]) === PRONE_VIEWHEIGHT;
  const [maxAngle, lerpSpeed, pitchScale, yawScale, horizScale, vertScale] = SWAY.map(
    (hip, k) => hip + (ADS_SWAY[k] - hip) * frac,
  );

  let pitchSpeed = 0;
  let yawSpeed = 0;
  const next = index + 1;
  if (next < t.length && timeline.snap[index] === 0 && t[next] > t[index]) {
    // AnglesSubtract over the span, scaled by 1 / (dt · 60).
    const scale = 1000 / ((t[next] - t[index]) * 60);
    pitchSpeed = clamp(angleDelta(ang[next * 3], ang[index * 3]) * scale, maxAngle);
    yawSpeed = clamp(angleDelta(ang[next * 3 + 1], ang[index * 3 + 1]) * scale, maxAngle);
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
      yawSpeed * horizScale,
      pitchSpeed * vertScale,
      pitchSpeed * pitchScale,
      yawSpeed * yawScale,
    ],
    rate: [
      posRate,
      posRate,
      posRate,
      rotRate,
      rotRate,
      rotRate,
      lerpSpeed,
      lerpSpeed,
      lerpSpeed,
      lerpSpeed,
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

/** One xanim frame step at their 24 fps. */
const FRAME_MS = 1000 / 24;
/**
 * luger_mp2's viewmodel xanims, by glTF clip name: length in ms (numframes - 1 steps at 24 fps,
 * XAnimGetLengthMsec) and the ms CoD2 plays it in. CG_RegisterWeapon (mac:353343-353398) sets
 * raiseAnim's rate to length / raiseTime and meleeAnim's to length / meleeTime; the rest play at
 * rate 1. None loops. ads_up and ads_down key only tag_torso, the others every other bone.
 */
const CLIPS = {
  idle: { clip: "viewmodel_luger_idle", ms: 1 * FRAME_MS, playMs: 1 * FRAME_MS },
  fire: { clip: "viewmodel_luger_fire", ms: 19 * FRAME_MS, playMs: 19 * FRAME_MS },
  fireAds: { clip: "viewmodel_luger_fire_ads", ms: 19 * FRAME_MS, playMs: 19 * FRAME_MS },
  melee: { clip: "viewmodel_luger_melee1", ms: 20 * FRAME_MS, playMs: 700 },
  raise: { clip: "viewmodel_luger_pullout", ms: 13 * FRAME_MS, playMs: 250 },
  adsUp: { clip: "viewmodel_luger_ads_up", ms: 10 * FRAME_MS, playMs: 10 * FRAME_MS },
  adsDown: { clip: "viewmodel_luger_ads_down", ms: 12 * FRAME_MS, playMs: 12 * FRAME_MS },
} as const;
type Clip = (typeof CLIPS)[keyof typeof CLIPS];

/**
 * The viewmodel anim tree at `time`, with `ads` from adsAt: CG_WeaponRunXModelAnims
 * (mac:353704-354117) on the one blend node CG_RegisterWeapon builds over the weapDef's xanims
 * (mac:353314-353336). A new ps->weapAnim gives its anim weight 1 and every other one 0 at once,
 * restarted (goal time 0, restart 1): fire or adsFire per shot (PM_Weapon_SetFPSFireAnim: adsFireAnim
 * above fWeaponPosFrac 0.75), melee1 per melee, pullout per raise. WEAP_IDLE waits until that anim
 * has finished (XAnimHasFinished) and then plays idleAnim from 0. CG_PlayADSAnim (mac:353097-353113)
 * poses ads_up at fWeaponPosFrac and ads_down at 1 - fWeaponPosFrac (rate 0), weighted toward the
 * one PMF_ADS asks for; their weights always sum to 1, so tag_torso is always held.
 */
export function viewmodelAnims(
  timeline: ReplayTimeline,
  time: number,
  { frac, up }: { frac: number; up: number },
): ViewmodelAnim[] {
  // The latest weapAnim change; on a tie the later one in PM_Weapon (raise, melee, fire) wins.
  let at = timeline.start;
  let anim: Clip = CLIPS.idle;
  let idleFrom = timeline.start;
  const consider = (starts: readonly number[], pick: (index: number) => Clip) => {
    const index = latest(starts, time);
    if (index < 0 || starts[index] < at) return;
    at = starts[index];
    anim = pick(index);
    idleFrom = at + anim.playMs;
  };
  consider(timeline.raises, () => CLIPS.raise);
  consider(timeline.meleeStarts, () => CLIPS.melee);
  consider(timeline.fireStarts, (shot) =>
    timeline.fireFrac[shot] > 0.75 ? CLIPS.fireAds : CLIPS.fire,
  );
  const base =
    time < idleFrom
      ? { clip: anim.clip, time: (Math.max(0, time - at) / anim.playMs) * (anim.ms / 1000) }
      : { clip: CLIPS.idle.clip, time: Math.min(time - idleFrom, CLIPS.idle.ms) / 1000 };
  return [
    { ...base, weight: 1 },
    { clip: CLIPS.adsUp.clip, time: (frac * CLIPS.adsUp.ms) / 1000, weight: up },
    { clip: CLIPS.adsDown.clip, time: ((1 - frac) * CLIPS.adsDown.ms) / 1000, weight: 1 - up },
  ];
}

/** Life of every pistolflash_view element drawn on the viewmodel (life 100). */
const FLASH_MS = 100;

/**
 * luger_mp2's viewFlashEffect, fx/muzzleflashes/pistolflash_view.efx (iw_07.iwd), fired on
 * tag_flash with each shot, at `time`: channel = (A(t) + (B(t) - A(t)) · w) · scale for t = age /
 * life, w one random per particle (FxPrimitives.c:1121-1127; values from the asset build's
 * pistolflash_view.json). small_flash: 3 additive sprites, atlas frame 13, radius 0.696 → 5 in,
 * alpha 0.2871→0.297 to 0.5149→0.505 (useRandomAlpha), roll ±360° spinning ±22.5°/s. big_flash:
 * count 1 0, so 0 or 1, frame 7, grey 0.7529 at alpha 0.5248→0.5149, radius 0 → 2.56..5 in, roll
 * 90..240°. light: 18..29 in ahead of the tag, radius 200 → 1 in, colour (1, 0.7137, 0.6196) × 1.307.
 * Additive sprites without useAlpha fade by colour × alpha.
 * shortcut: the smoke puff (1-1.5 s, world space) is left out; it needs the camera and viewmodel
 * pose at each recent shot.
 */
export function muzzleFlash(timeline: ReplayTimeline, time: number): ViewmodelFlash | null {
  const shot = latest(timeline.fireStarts, time);
  const ms = shot < 0 ? FLASH_MS : time - timeline.fireStarts[shot];
  if (ms >= FLASH_MS) return null;
  const t = ms / FLASH_MS;
  // Per-shot draws, apart from the gun kick's two.
  const w = (k: number) => random(shot * 16 + 2 + k);
  const sprites: ViewmodelFlash["sprites"][number][] = [0, 1, 2].map((k) => {
    const low = 0.2871 + (0.297 - 0.2871) * t;
    const high = 0.5149 + (0.505 - 0.5149) * t;
    return {
      frame: 13,
      radius: (0.1392 + (1 - 0.1392) * t) * 5,
      roll: -360 + 720 * w(k) + (0.5 - w(3 + k)) * 45 * (ms / 1000),
      color: low + (high - low) * w(6 + k),
    };
  });
  if (w(9) >= 0.5) {
    sprites.push({
      frame: 7,
      radius: (t + (0.5127 * t - t) * w(10)) * 5,
      roll: 90 + 150 * w(11),
      color: 0.7529 * (0.5248 + (0.5149 - 0.5248) * t),
    });
  }
  return {
    sprites,
    light: {
      offset: 18 + 11 * w(12),
      radius: (0.75 + (0.00375 - 0.75) * t) * 266.7,
      color: [1.307, 0.7137 * 1.307, 0.6196 * 1.307],
    },
  };
}

/** Index of the latest start at or before `time`, or -1. */
function latest(starts: readonly number[], time: number): number {
  const index = findSampleIndex(starts, time);
  return index < 0 || starts[index] > time ? -1 : index;
}

/** AnglesSubtract: a - b wrapped to [-180, 180). */
function angleDelta(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
