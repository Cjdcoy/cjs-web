import { leanFraction, type BodyPose, type ViewmodelAnim } from "../mapViewer";
import {
  FLAG_IN_AIR,
  INPUT_BACK,
  INPUT_FORWARD,
  INPUT_JUMP,
  INPUT_LEFT,
  INPUT_RIGHT,
} from "./replayHudModel";
import {
  AIM_IN,
  AUX_LADDER,
  AUX_MANTLE,
  eyeHeight,
  findSampleIndex,
  INPUT_ATTACK,
  INPUT_IN_AIR,
  leanAt,
  samplePose,
  type ReplayTimeline,
} from "./replayPlayback";
import { landingAt } from "./replayWeapon";

/*
 * The third-person CoD2 player the runner is, posed from the samples the way the game poses a player
 * entity. The contract is model-src/player-anims/out/READY.md: mp/playeranim.script resolved for
 * luger_mp2 (§5), PM_Footsteps and the jump, land and weapon events (§6), BG_PlayAnim timers,
 * BG_SetNewAnimation blends and start phases, BG_RunLerpFrameRate rates (§7), BG_PlayerAngles swings
 * and BG_Player_DoControllers (§8); CoD2rev bg_animation_mp.cpp and bg_pmove.cpp.
 *
 * That pose depends on history (blends, event holds, the legs' 40° turn threshold, controller lerps),
 * so the state is stepped one sample (one pmove frame) at a time and kept at every `stride`-th sample
 * once first reached. A pose at `time` restores the checkpoint at or before it and steps the rest, at
 * most stride - 1 samples plus the part to `time`: seeking to a time gives exactly the pose that
 * playing up to it gives, and a frame costs a bounded number of steps. A load or teleport (a timeline
 * snap) starts over from a settled pose, as a seek would.
 */

const LOOP = 1;
/** A `pt_*` clip: the torso subtree. Everything else is in the legs subtree. */
const TORSO_TREE = 2;
/** rateFromVerticalSpeed (flag 0x2): the ladder anims. */
const CLIMB = 4;
/** The script's blend-in time: 30 ms for fire anims, `blendtime 100` for jump takeoffs. */
const LERP_30 = 8;
const LERP_100 = 16;

/** The GLB's clips (READY.md §4): name, frames, fps, moveSpeed in inches/s, flags. */
const CLIP_TABLE: readonly (readonly [string, number, number, number, number])[] = [
  ["pb_stand_alert_pistol", 101, 30, 0, LOOP],
  ["pb_stand_ads_pistol", 101, 30, 0, LOOP],
  ["pb_crouch_alert_pistol", 101, 30, 0, LOOP],
  ["pb_crouch_ads_pistol", 101, 30, 0, LOOP],
  ["pb_prone_aim_pistol", 91, 24, 0, LOOP],
  ["pb_combatwalk_forward_loop_pistol", 31, 30, 57.4577, LOOP],
  ["pb_combatwalk_left_loop_pistol", 31, 30, 60.5252, LOOP],
  ["pb_combatwalk_right_loop_pistol", 31, 30, 60.5252, LOOP],
  ["pb_combatwalk_back_loop_pistol", 31, 30, 57.4577, LOOP],
  ["pb_crouch_walk_forward_pistol", 31, 30, 52.3622, LOOP],
  ["pb_crouch_walk_left_pistol", 31, 30, 52.3622, LOOP],
  ["pb_crouch_walk_right_pistol", 31, 30, 52.3622, LOOP],
  ["pb_crouch_walk_back_pistol", 31, 30, 52.3622, LOOP],
  ["pb_prone_crawl_pistol", 46, 24, 23.7297, LOOP],
  ["pb_prone_pistol_crawl_left", 25, 24, 35.102, LOOP],
  ["pb_prone_pistol_crawl_right", 25, 24, 34.9382, LOOP],
  ["pb_prone_crawl_pistol_back", 46, 24, 23.7297, LOOP],
  ["pb_pistol_run_fast", 25, 30, 200.5646, LOOP],
  ["pb_combatrun_left_loop_pistol", 25, 30, 159.941, LOOP],
  ["pb_combatrun_right_loop_pistol", 25, 30, 159.941, LOOP],
  ["pb_combatrun_back_loop_pistol", 19, 30, 180.4462, LOOP],
  ["pb_crouch_run_forward_pistol", 31, 30, 80.4072, LOOP],
  ["pb_crouch_run_left_pistol", 31, 30, 80.4071, LOOP],
  ["pb_crouch_run_right_pistol", 31, 30, 80.4071, LOOP],
  ["pb_crouch_run_back_pistol", 31, 30, 80.4071, LOOP],
  ["pb_climbup", 21, 24, 57.7157, LOOP | CLIMB],
  ["pb_climbdown", 21, 24, 57.7157, LOOP | CLIMB],
  ["mp_mantle_up_57", 26, 30, 0, 0],
  ["mp_mantle_up_51", 23, 30, 0, 0],
  ["mp_mantle_up_45", 23, 30, 0, 0],
  ["mp_mantle_up_39", 21, 30, 0, 0],
  ["mp_mantle_up_33", 16, 30, 0, 0],
  ["mp_mantle_up_27", 11, 30, 0, 0],
  ["mp_mantle_up_21", 10, 30, 0, 0],
  ["mp_mantle_over_high", 22, 30, 0, 0],
  ["mp_mantle_over_mid", 13, 30, 0, 0],
  ["mp_mantle_over_low", 51, 30, 0, 0],
  ["pt_stand_shoot_pistol", 11, 30, 0, TORSO_TREE | LERP_30],
  ["pb_stand__shoot_ads_pistol", 11, 30, 0, LERP_30],
  ["pt_crouch_shoot_pistol", 11, 30, 0, TORSO_TREE | LERP_30],
  ["pt_crouch_shoot_ads_pistol", 11, 30, 0, TORSO_TREE | LERP_30],
  ["pt_prone_shoot_pistol", 30, 24, 0, TORSO_TREE | LERP_30],
  ["pb_standjump_takeoff_pistol", 18, 24, 0, LERP_100],
  ["pb_runjump_takeoff_pistol", 17, 24, 0, LERP_100],
  ["pb_standjump_takeoff", 12, 24, 0, LERP_100],
  ["pb_chicken_dance_crouch", 81, 30, 0, LOOP | LERP_100],
  ["pb_standjump_land_pistol", 4, 24, 0, 0],
  ["pb_runjump_land_pistol", 14, 24, 0, 0],
  ["pt_stand_pullout_pose", 1, 30, 0, TORSO_TREE],
  ["pt_crouch_pullout_pose", 1, 30, 0, TORSO_TREE],
  ["pt_prone_pullout_pose", 1, 30, 0, TORSO_TREE],
  ["pb_prone2crouch", 17, 30, 0, 0],
  ["pt_melee_pistol_1", 13, 30, 0, TORSO_TREE],
  ["pt_melee_pistol_2", 11, 30, 0, TORSO_TREE],
  ["pt_melee_pistol_3", 18, 30, 0, TORSO_TREE],
  ["pt_melee_pistol_4", 14, 30, 0, TORSO_TREE],
  ["pt_melee_prone_pistol", 20, 24, 0, TORSO_TREE],
];

interface Clip {
  name: string;
  /** XAnimGetLength: (frames - 1) / fps, in ms. */
  ms: number;
  loop: boolean;
  moveSpeed: number;
  torsoTree: boolean;
  climb: boolean;
  /** initialLerp, -1 for none. */
  lerp: number;
  /** animation_t.duration (gameDurationMs): the event hold without a script duration. */
  hold: number;
  /** Strafe flag 0x10 / 0x20: the legs face the view. */
  strafe: boolean;
  /** The movetype the client reads back from it as the legs anim, -1 for event anims. */
  movetype: number;
}

const CLIPS: Clip[] = CLIP_TABLE.map(([name, frames, fps, moveSpeed, flags]) => {
  const ms = ((frames - 1) / fps) * 1000;
  return {
    name,
    ms,
    loop: (flags & LOOP) !== 0,
    moveSpeed,
    torsoTree: (flags & TORSO_TREE) !== 0,
    climb: (flags & CLIMB) !== 0,
    lerp: flags & LERP_30 ? 30 : flags & LERP_100 ? 100 : -1,
    hold: Math.max(500, Math.trunc(ms)),
    strafe: false,
    movetype: -1,
  };
});
const clipId = (name: string) => CLIPS.findIndex((clip) => clip.name === name);

/** Movetypes (scriptAnimMoveTypes_t), as indices of MOVETYPE_CLIPS; MANTLE stands for all mantles. */
const IDLE = 0;
const IDLECR = 1;
const IDLEPRONE = 2;
const WALK = 3;
const WALKBK = 4;
const WALKCR = 5;
const WALKCRBK = 6;
const WALKPRONE = 7;
const WALKPRONEBK = 8;
const RUN = 9;
const RUNBK = 10;
const RUNCR = 11;
const RUNCRBK = 12;
const CLIMBUP = 13;
const CLIMBDOWN = 14;
const MANTLE = 15;
const CROUCH_MOVETYPES = [IDLECR, WALKCR, WALKCRBK, RUNCR, RUNCRBK];
const PRONE_MOVETYPES = [IDLEPRONE, WALKPRONE, WALKPRONEBK];

/**
 * Each locomotion movetype's clip for luger_mp2 (READY.md §5): idles by weapon position (hip, ADS),
 * the strafing movetypes by strafing condition (not, left, right).
 */
const MOVETYPE_CLIPS = [
  ["pb_stand_alert_pistol", "pb_stand_ads_pistol"],
  ["pb_crouch_alert_pistol", "pb_crouch_ads_pistol"],
  ["pb_prone_aim_pistol"],
  [
    "pb_combatwalk_forward_loop_pistol",
    "pb_combatwalk_left_loop_pistol",
    "pb_combatwalk_right_loop_pistol",
  ],
  ["pb_combatwalk_back_loop_pistol"],
  ["pb_crouch_walk_forward_pistol", "pb_crouch_walk_left_pistol", "pb_crouch_walk_right_pistol"],
  ["pb_crouch_walk_back_pistol"],
  ["pb_prone_crawl_pistol", "pb_prone_pistol_crawl_left", "pb_prone_pistol_crawl_right"],
  ["pb_prone_crawl_pistol_back"],
  ["pb_pistol_run_fast", "pb_combatrun_left_loop_pistol", "pb_combatrun_right_loop_pistol"],
  ["pb_combatrun_back_loop_pistol"],
  ["pb_crouch_run_forward_pistol", "pb_crouch_run_left_pistol", "pb_crouch_run_right_pistol"],
  ["pb_crouch_run_back_pistol"],
  ["pb_climbup"],
  ["pb_climbdown"],
].map((names, movetype) =>
  names.map((name, index) => {
    const id = clipId(name);
    CLIPS[id].movetype = movetype;
    CLIPS[id].strafe = names.length === 3 && index > 0;
    return id;
  }),
);

/** Engine mantles (Mantle_FindTransition, s_mantleTrans): up height, its clip and the over clip. */
const MANTLES = [57, 51, 45, 39, 33, 27, 21].map((height) => {
  const over = height >= 51 ? "high" : height >= 33 ? "mid" : "low";
  const up = clipId(`mp_mantle_up_${height}`);
  CLIPS[up].movetype = MANTLE;
  return { height, up, over: clipId(`mp_mantle_over_${over}`) };
});
for (const name of ["high", "mid", "low"])
  CLIPS[clipId(`mp_mantle_over_${name}`)].movetype = MANTLE;
/**
 * How far an aux-bit-8 run's length may part from an engine mantle's (up, or up plus over) and still
 * count as one: a 20 Hz replay blurs both ends by up to a sample.
 */
const MANTLE_TOLERANCE_MS = 110;

const RUN_TAKEOFF = clipId("pb_runjump_takeoff_pistol");
const STAND_TAKEOFF = clipId("pb_standjump_takeoff_pistol");
const BACK_TAKEOFF = clipId("pb_standjump_takeoff");
const CROUCH_BACK_TAKEOFF = clipId("pb_chicken_dance_crouch");
const RUN_LAND = clipId("pb_runjump_land_pistol");
const STAND_LAND = clipId("pb_standjump_land_pistol");
const PRONE_TO_CROUCH = clipId("pb_prone2crouch");
const FIRE_STAND = clipId("pt_stand_shoot_pistol");
const FIRE_STAND_ADS = clipId("pb_stand__shoot_ads_pistol");
const FIRE_CROUCH = clipId("pt_crouch_shoot_pistol");
const FIRE_CROUCH_ADS = clipId("pt_crouch_shoot_ads_pistol");
const FIRE_PRONE = clipId("pt_prone_shoot_pistol");
const PULLOUT = ["stand", "crouch", "prone"].map((stance) => clipId(`pt_${stance}_pullout_pose`));
/** The four standing melee swings and their script durations; rand() % 4 picks one in game. */
const MELEES = [400, 350, 550, 400].map((ms, index) => ({
  clip: clipId(`pt_melee_pistol_${index + 1}`),
  ms,
}));
const MELEE_PRONE = clipId("pt_melee_prone_pistol");

/** Script `duration 5` of the jump and land events. */
const JUMP_DURATION = 5;
/** BG_PlayAnim: a part takes a non-forced command only below this timer. */
const TIMER_FREE = 50;
/** player_moveThreshhold, the no-key idle speed, and PM_SetMovementDir's moving speed (units/s). */
const MOVE_THRESHOLD = 10;
const NO_KEY_IDLE_SPEED = 120;
const MOVE_DIR_SPEED = 5;
/** PM_GroundTraceMissed: leaving the ground with no ground this far below is a jump. */
const LEDGE_DROP = 64;
/** PM_Footsteps skips the ladder anims this long after a jump. */
const LADDER_AFTER_JUMP_MS = 300;
/** bg_prone_yawcap. */
const PRONE_YAW_CAP = 85;
/** bg_swingSpeed for the yaws, and the torso pitch's own. */
const YAW_SWING = 0.2;
const PITCH_SWING = 0.15;
/** BG_Player_DoControllers' lerp: degrees and inches per ms. */
const CONTROL_DEG_PER_MS = 0.36;
const CONTROL_INCH_PER_MS = 0.1;
/** The most clips fading at once; the faintest goes first. */
const MAX_LAYERS = 8;
/** Checkpoints kept at most; the stride grows past it. */
const MAX_CHECKPOINTS = 20_000;
const MIN_STRIDE = 16;

/** Per-sample event bits. */
const EV_AIR = 1;
const EV_JUMP = 2;
const EV_JUMP_FORCED = 4;
const EV_LAND = 8;
const EV_FIRE = 16;
const EV_MELEE = 32;
const EV_DROP = 64;
/** Linked to J4L's scripted climb mover: idle, counted as on the ground. */
const EV_LINKED = 128;
/** EF_FIRING: attack held with a weapon out. */
const EV_FIRING = 256;

interface Layer {
  clip: number;
  weight: number;
  goal: number;
  /** Weight change per ms toward the goal. */
  step: number;
  /** Normalized clip time (XAnim time), 0 to 1. */
  phase: number;
  /** Playback rate; kept while the clip fades out. */
  rate: number;
}

interface Fade {
  weight: number;
  goal: number;
  step: number;
}

interface Swing {
  angle: number;
  swinging: boolean;
}

interface BodyState {
  /** Time of the sample the state was last decided at, ms. */
  time: number;
  /** The legs and torso anims (clip index), -1 for none. */
  legs: number;
  torso: number;
  legsTimer: number;
  torsoTimer: number;
  layers: Layer[];
  /** The anim tree's torso and legs node weights (§7.3). */
  torsoNode: Fade;
  legsNode: Fade;
  /** When the legs' 400 ms stance transition ends. */
  stanceUntil: number;
  /** The movetype condition: the last locomotion movetype asked for. */
  movetype: number;
  /** The movetype read back from the legs anim; event anims keep the last one. */
  clientMovetype: number;
  /** Strafing condition: 0 not, 1 left, 2 right. */
  strafe: number;
  /** PMF_BACKWARDS_RUN. */
  backwards: boolean;
  lastJump: number;
  torsoYaw: Swing;
  legsYaw: Swing;
  torsoPitch: Swing;
  /** Lerped controller angles (6 × 3), then tag_origin's angles (3) and offset (3). */
  control: number[];
}

/** Per-sample inputs read once from the samples. */
interface Prepared {
  events: Uint16Array;
  /** The engine mantle clip playing at each sample, or -1. */
  mantle: Int16Array;
  /** PM_SetMovementDir, whole degrees. */
  moveDir: Int16Array;
  stride: number;
  /** State at every stride-th sample, filled as playback reaches it. */
  checkpoints: BodyState[];
}

export interface BodyTrack {
  timeline: ReplayTimeline;
  /** Built on the first pose, so a replay watched only in first person pays nothing. */
  prepared: Prepared | null;
}

export function createBodyTrack(timeline: ReplayTimeline): BodyTrack {
  return { timeline, prepared: null };
}

/** The body at `time` (ms); none for a replay without samples. */
export function bodyAt(track: BodyTrack, time: number): BodyPose | undefined {
  const { timeline } = track;
  const { t } = timeline.samples;
  if (t.length === 0) return undefined;
  const prepared = (track.prepared ??= prepare(timeline));
  const index = findSampleIndex(t, time);
  const stored = Math.floor(index / prepared.stride);
  while (prepared.checkpoints.length <= stored) {
    const last = prepared.checkpoints.length - 1;
    const state = cloneState(prepared.checkpoints[last]);
    for (let from = last * prepared.stride; from < (last + 1) * prepared.stride; from += 1) {
      step(timeline, prepared, from, state);
    }
    prepared.checkpoints.push(state);
  }
  const state = cloneState(prepared.checkpoints[stored]);
  for (let from = stored * prepared.stride; from < index; from += 1) {
    step(timeline, prepared, from, state);
  }
  const pose = samplePose(timeline, time);
  const at = Math.max(time, t[index]);
  advance(timeline, prepared, index, state, at - state.time, {
    yaw: pose.yaw,
    pitch: pose.pitch,
    moveDir: moveDirAt(timeline, prepared, index, at),
    lean: leanAt(timeline, at),
  });
  const aux = timeline.samples.aux?.[index] ?? 0;
  const control = state.control;
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z - eyeHeight(timeline, time),
    yaw: pose.yaw,
    pitch: pose.pitch,
    legsYaw: state.legsYaw.angle,
    anims: mixerWeights(state),
    origin: {
      angles: [control[18], control[19], control[20]],
      offset: [control[21], control[22], control[23]],
    },
    controllers: [0, 1, 2, 3, 4, 5].map(
      (bone) => [control[bone * 3], control[bone * 3 + 1], control[bone * 3 + 2]] as const,
    ),
    weapon: ((aux >> 1) & 3) !== 3,
  };
}

/** Reads the per-sample events, mantles and move directions, and settles the first sample. */
function prepare(timeline: ReplayTimeline): Prepared {
  const { samples, snap, stance } = timeline;
  const { aux, ang, flags, input, pos, t, vel } = samples;
  const count = t.length;
  const events = new Uint16Array(count);
  const mantle = new Int16Array(count).fill(-1);
  const moveDir = new Int16Array(count);
  const air = (index: number) =>
    flags ? (flags[index] & FLAG_IN_AIR) !== 0 : ((input?.[index] ?? 0) & INPUT_IN_AIR) !== 0;
  const auxAt = (index: number) => aux?.[index] ?? 0;
  const armed = (index: number) =>
    ((auxAt(index) >> 1) & 3) <= 1 && (auxAt(index) & (AUX_LADDER | AUX_MANTLE)) === 0;
  const broken = (index: number) => index === 0 || snap[index - 1] === 1;

  for (let index = 0; index < count; index += 1) {
    if (air(index)) events[index] |= EV_AIR;
    if (((input?.[index] ?? 0) & INPUT_ATTACK) !== 0 && armed(index)) events[index] |= EV_FIRING;
    if (!broken(index)) {
      const from = (auxAt(index - 1) >> 1) & 3;
      if (from <= 1 && ((auxAt(index) >> 1) & 3) !== from) events[index] |= EV_DROP;
    }
  }
  for (const shot of timeline.fireStarts) events[findSampleIndex(t, shot)] |= EV_FIRE;
  for (const swing of timeline.meleeStarts) events[findSampleIndex(t, swing)] |= EV_MELEE;

  // Aux bit 8 is an engine mantle or J4L's scripted climb: a run as long as an engine mantle's anims
  // for its rise is the engine's, anything else the linked climb.
  for (let start = 0; start < count; start += 1) {
    if ((auxAt(start) & AUX_MANTLE) === 0) continue;
    let end = start;
    while (end + 1 < count && (auxAt(end + 1) & AUX_MANTLE) !== 0 && snap[end] !== 1) end += 1;
    const after = end + 1 < count && snap[end] !== 1 ? end + 1 : end;
    const length = t[after] - t[start];
    const rise = pos[after * 3 + 2] - pos[start * 3 + 2];
    const fit = MANTLES.reduce((best, entry) =>
      Math.abs(entry.height - rise) < Math.abs(best.height - rise) ? entry : best,
    );
    const upMs = CLIPS[fit.up].ms;
    const overMs = upMs + CLIPS[fit.over].ms;
    const onto = Math.abs(length - upMs) <= MANTLE_TOLERANCE_MS;
    const over = !onto && Math.abs(length - overMs) <= MANTLE_TOLERANCE_MS;
    for (let index = start; index <= end; index += 1) {
      if (onto || over) mantle[index] = t[index] - t[start] < upMs ? fit.up : fit.over;
      else events[index] |= EV_LINKED;
    }
    // Mantle_Move ends a mantle over with a forced jump event.
    if (over && after > end) events[after] |= EV_JUMP | EV_JUMP_FORCED;
    start = end;
  }

  // The first ground sample at or after each one, before the next snap (-1: none).
  const landing = new Int32Array(count);
  for (let index = count - 1; index >= 0; index -= 1) {
    landing[index] =
      !air(index) || (events[index] & EV_LINKED) !== 0
        ? index
        : index + 1 < count && snap[index] !== 1
          ? landing[index + 1]
          : -1;
  }

  let proneYaw = 0;
  let ladderYaw = 0;
  for (let index = 0; index < count; index += 1) {
    const yaw = ang[index * 3 + 1];
    const { forward, right } = moveKeys(timeline, index);
    const ladder = (auxAt(index) & AUX_LADDER) !== 0;
    const grounded = !air(index) || (events[index] & EV_LINKED) !== 0;
    if (!broken(index)) {
      const previous = index - 1;
      const pressed = (((input?.[index] ?? 0) | (input?.[previous] ?? 0)) & INPUT_JUMP) !== 0;
      if (!air(previous) && air(index) && mantle[index] < 0 && (events[index] & EV_LINKED) === 0) {
        const land = landing[index];
        const drop = land < 0 || pos[previous * 3 + 2] - pos[land * 3 + 2] > LEDGE_DROP;
        const rising = vel[index * 3 + 2] > 0;
        const thrown = rising && stance[index] !== 2 && !ladder;
        // Jump_Check on a press, PM_GroundTraceMissed off a high ledge (forced), or thrown up.
        if ((pressed && rising) || drop) events[index] |= EV_JUMP | EV_JUMP_FORCED;
        else if (thrown) events[index] |= EV_JUMP;
      }
      // PM_CheckLadderMove: falling off a ladder in the air.
      if ((auxAt(previous) & AUX_LADDER) !== 0 && !ladder && air(index)) {
        events[index] |= EV_JUMP | EV_JUMP_FORCED;
      }
      if (landingAt(timeline, previous, index)) events[index] |= EV_LAND;
    }

    // PM_SetMovementDir (READY.md §8.4).
    let direction = 0;
    if (stance[index] === 2) {
      if (broken(index) || stance[index - 1] !== 2) proneYaw = yaw;
      const off = angleSub(yaw, proneYaw);
      if (Math.abs(off) > PRONE_YAW_CAP) proneYaw = yaw - Math.sign(off) * PRONE_YAW_CAP;
      direction = angleSub(proneYaw, yaw);
    } else if (ladder) {
      if (broken(index) || (auxAt(index - 1) & AUX_LADDER) === 0) ladderYaw = yaw;
      direction = angleSub(ladderYaw, yaw);
    } else if (
      grounded &&
      (forward !== 0 || right !== 0) &&
      Math.hypot(vel[index * 3], vel[index * 3 + 1]) > MOVE_DIR_SPEED
    ) {
      const heading = (Math.atan2(vel[index * 3 + 1], vel[index * 3]) * 180) / Math.PI;
      direction = angleSub(heading + (forward < 0 ? 180 : 0), yaw);
    }
    moveDir[index] = Math.max(-90, Math.min(90, Math.round(direction)));
  }

  const stride = Math.max(MIN_STRIDE, Math.ceil(count / MAX_CHECKPOINTS));
  const prepared: Prepared = { events, mantle, moveDir, stride, checkpoints: [] };
  prepared.checkpoints.push(settle(timeline, prepared, 0));
  return prepared;
}

/**
 * The move keys' signs: forwardmove and rightmove of the recorded full presses, or for a replay
 * without input bits the side of the view the velocity points to.
 */
function moveKeys(timeline: ReplayTimeline, index: number): { forward: number; right: number } {
  const { ang, input, vel } = timeline.samples;
  if (input) {
    const keys = input[index];
    return {
      forward: Number((keys & INPUT_FORWARD) !== 0) - Number((keys & INPUT_BACK) !== 0),
      right: Number((keys & INPUT_RIGHT) !== 0) - Number((keys & INPUT_LEFT) !== 0),
    };
  }
  const [vx, vy] = [vel[index * 3], vel[index * 3 + 1]];
  const speed = Math.hypot(vx, vy);
  if (speed < MOVE_THRESHOLD) return { forward: 0, right: 0 };
  const yaw = (ang[index * 3 + 1] * Math.PI) / 180;
  const along = (vx * Math.cos(yaw) + vy * Math.sin(yaw)) / speed;
  const side = (vx * Math.sin(yaw) - vy * Math.cos(yaw)) / speed;
  // Outside ±67.5° of an axis the key is held (a diagonal holds both).
  const key = (value: number) => (value > 0.38 ? 1 : value < -0.38 ? -1 : 0);
  return { forward: key(along), right: key(side) };
}

/** A fresh state at sample `index`: the anims set without blends, angles at their targets. */
function settle(timeline: ReplayTimeline, prepared: Prepared, index: number): BodyState {
  const state: BodyState = {
    time: timeline.samples.t[index],
    legs: -1,
    torso: -1,
    legsTimer: 0,
    torsoTimer: 0,
    layers: [],
    torsoNode: { weight: 0, goal: 0, step: 0 },
    legsNode: { weight: 1, goal: 1, step: 0 },
    stanceUntil: Number.NEGATIVE_INFINITY,
    movetype: -1,
    clientMovetype: -1,
    strafe: 0,
    backwards: false,
    lastJump: Number.NEGATIVE_INFINITY,
    torsoYaw: { angle: 0, swinging: false },
    legsYaw: { angle: 0, swinging: false },
    torsoPitch: { angle: 0, swinging: false },
    control: new Array<number>(24).fill(0),
  };
  decide(timeline, prepared, index, state, true);
  const { ang } = timeline.samples;
  const view = {
    yaw: ang[index * 3 + 1],
    pitch: ang[index * 3],
    moveDir: prepared.moveDir[index],
    lean: timeline.lean[index],
  };
  const targets = angles(timeline, prepared, index, state, view);
  state.legsYaw.angle = targets.legs;
  state.torsoYaw.angle = targets.torso;
  state.torsoPitch.angle = targets.pitch;
  state.control = controls(timeline, index, state, view);
  return state;
}

/** One pmove frame: from sample `index` to the next, then that sample's commands. */
function step(timeline: ReplayTimeline, prepared: Prepared, index: number, state: BodyState) {
  const next = index + 1;
  if (timeline.snap[index] === 1) {
    Object.assign(state, settle(timeline, prepared, next));
    return;
  }
  const { ang, t } = timeline.samples;
  advance(timeline, prepared, index, state, t[next] - state.time, {
    yaw: ang[next * 3 + 1],
    pitch: ang[next * 3],
    moveDir: prepared.moveDir[next],
    lean: timeline.lean[next],
  });
  decide(timeline, prepared, next, state, false);
}

interface View {
  yaw: number;
  pitch: number;
  moveDir: number;
  lean: number;
}

/** The client's lerped move direction between sample `index` and the next. */
function moveDirAt(timeline: ReplayTimeline, prepared: Prepared, index: number, time: number) {
  const { t } = timeline.samples;
  const next = index + 1;
  const from = prepared.moveDir[index];
  if (next >= t.length || timeline.snap[index] === 1 || t[next] <= t[index]) return from;
  const s = Math.min(1, (time - t[index]) / (t[next] - t[index]));
  return from + (prepared.moveDir[next] - from) * s;
}

/**
 * Sample `index`'s commands (READY.md §6, in pmove order): stance events, jump and land, the
 * locomotion movetype, then the weapon events. `cold` settles a fresh state: everything snaps.
 */
function decide(
  timeline: ReplayTimeline,
  prepared: Prepared,
  index: number,
  state: BodyState,
  cold: boolean,
): void {
  const { samples, stance } = timeline;
  const { vel } = samples;
  const now = samples.t[index];
  state.time = now;
  const events = prepared.events[index];
  const { forward, right } = moveKeys(timeline, index);
  // PmoveSingle's PMF_BACKWARDS_RUN.
  if (forward < 0) state.backwards = true;
  else if (forward > 0 || right !== 0) state.backwards = false;
  const play = (part: "both" | "torso", clip: number, force: boolean, hold?: number) =>
    playAnim(state, now, cold, part, clip, force, hold);

  // PM_CheckDuck: to or from prone clears the torso; prone to crouch has its own anim.
  const from = index > 0 ? stance[index - 1] : stance[index];
  const to = stance[index];
  if (!cold && from !== to) {
    if (from === 2 || to === 2) play("torso", -1, true);
    if (from === 2 && to === 1) play("both", PRONE_TO_CROUCH, false, CLIPS[PRONE_TO_CROUCH].hold);
  }

  if (events & EV_JUMP) {
    state.lastJump = now;
    const crouched = stanceClass(state.movetype) !== 0;
    const clip =
      forward < 0
        ? crouched
          ? CROUCH_BACK_TAKEOFF
          : BACK_TAKEOFF
        : state.movetype === RUN
          ? RUN_TAKEOFF
          : STAND_TAKEOFF;
    play("both", clip, (events & EV_JUMP_FORCED) !== 0, JUMP_DURATION);
  }
  if (events & EV_LAND) {
    play("both", state.movetype === RUN ? RUN_LAND : STAND_LAND, true, JUMP_DURATION);
  }

  const ads = timeline.aim[index] === AIM_IN;
  const linked = (events & EV_LINKED) !== 0;
  const mantleClip = prepared.mantle[index];
  const speed = Math.hypot(vel[index * 3], vel[index * 3 + 1]);
  const idle = to === 2 ? IDLEPRONE : to === 1 ? IDLECR : IDLE;
  let movetype = -1;
  let clip = -1;
  if (mantleClip >= 0) {
    // Mantle_Move plays the mantle movetype for its whole length.
    movetype = MANTLE;
    clip = mantleClip;
  } else if ((events & EV_AIR) !== 0 && !linked && !cold) {
    const ladder = ((samples.aux?.[index] ?? 0) & AUX_LADDER) !== 0;
    if (ladder && now - state.lastJump >= LADDER_AFTER_JUMP_MS) {
      movetype = vel[index * 3 + 2] >= 0 ? CLIMBUP : CLIMBDOWN;
    }
  } else if (speed < MOVE_THRESHOLD || linked) {
    movetype = idle;
  } else {
    if (forward !== 0) state.strafe = 0;
    else if (right !== 0) state.strafe = right > 0 ? 2 : 1;
    const walking = (ads && to !== 2) || timeline.lean[index] !== 0;
    const back = state.backwards;
    movetype =
      to === 2
        ? back
          ? WALKPRONEBK
          : WALKPRONE
        : to === 1
          ? walking
            ? back
              ? WALKCRBK
              : WALKCR
            : back
              ? RUNCRBK
              : RUNCR
          : walking
            ? back
              ? WALKBK
              : WALK
            : back
              ? RUNBK
              : RUN;
    if (forward === 0 && right === 0 && speed <= NO_KEY_IDLE_SPEED) movetype = idle;
  }
  if (movetype >= 0) {
    state.movetype = movetype;
    if (clip < 0) {
      const clips = MOVETYPE_CLIPS[movetype];
      const pick = movetype === IDLE || movetype === IDLECR ? Number(ads) : state.strafe;
      clip = clips[clips.length > 1 ? pick : 0];
    }
    play("both", clip, false);
  }

  // PM_Weapon: shots, melee swings and weapon changes (READY.md §6.3), by the movetype condition.
  const mt = state.movetype;
  const prone = PRONE_MOVETYPES.includes(mt);
  if (events & EV_FIRE) {
    const shot =
      mt === IDLE || mt === CLIMBUP || mt === CLIMBDOWN
        ? ads
          ? FIRE_STAND_ADS
          : FIRE_STAND
        : mt === IDLECR
          ? ads
            ? FIRE_CROUCH_ADS
            : FIRE_CROUCH
          : prone
            ? FIRE_PRONE
            : -1;
    if (shot >= 0) play("torso", shot, true, CLIPS[shot].hold);
  }
  if (events & EV_MELEE) {
    const swing = MELEES[hash(index) % 4];
    if (prone) play("torso", MELEE_PRONE, true, CLIPS[MELEE_PRONE].hold);
    else play("torso", swing.clip, true, swing.ms);
  }
  if (events & EV_DROP) {
    const pose = PULLOUT[stanceClass(mt)];
    play("torso", pose, false, CLIPS[pose].hold);
  }

  // BG_RunLerpFrameRate for the legs' and the torso's current anim.
  const speed3d = Math.hypot(vel[index * 3], vel[index * 3 + 1], vel[index * 3 + 2]);
  const vertical = Math.abs(vel[index * 3 + 2]);
  for (const current of [state.legs, state.torso]) {
    const layer = state.layers.find((entry) => entry.clip === current);
    if (layer) layer.rate = playbackRate(CLIPS[current], speed3d, vertical);
  }
  if (cold) state.stanceUntil = Number.NEGATIVE_INFINITY;
}

/**
 * BG_PlayAnim for one command: `both` sets the legs and clears the torso, each only when its timer
 * is under 50 ms or the command is forced. Locomotion (no `hold`) leaves a running anim alone
 * (isContinue); an event (`hold` ms) re-sets it and holds the part for hold + 50 ms.
 */
function playAnim(
  state: BodyState,
  now: number,
  cold: boolean,
  part: "both" | "torso",
  clip: number,
  force: boolean,
  hold?: number,
): void {
  const event = hold !== undefined;
  if (part === "both" && (state.legsTimer < TIMER_FREE || force)) {
    if (event || state.legs !== clip) {
      setLegs(state, now, cold, clip);
      if (event) state.legsTimer = hold + TIMER_FREE;
    }
  }
  const torso = part === "both" ? -1 : clip;
  if (state.torsoTimer < TIMER_FREE || force) {
    if (event || state.torso !== torso) {
      setTorso(state, now, cold, torso);
      if (event) state.torsoTimer = hold + TIMER_FREE;
    }
  }
}

/** BG_SetNewAnimation's blend time (READY.md §7.2), ms. */
function blendTime(state: BodyState, now: number, clip: Clip | null, old: Clip | null): number {
  let time = clip ? clip.lerp : 200;
  let minimum = -1;
  if (!clip || time <= 0) {
    minimum = clip && clip.moveSpeed !== 0 ? 120 : old && old.moveSpeed !== 0 ? 250 : 170;
  }
  minimum = Math.max(minimum, state.stanceUntil - now);
  time = Math.max(time, minimum);
  return time;
}

function setLegs(state: BodyState, now: number, cold: boolean, id: number): void {
  const clip = CLIPS[id];
  const old = state.legs >= 0 ? CLIPS[state.legs] : null;
  if (stanceClass(clip.movetype) !== stanceClass(old?.movetype ?? -1))
    state.stanceUntil = now + 400;
  // The first legs anim snaps.
  const time = cold || !old ? 0 : blendTime(state, now, clip, old);
  const oldLayer = state.layers.find((layer) => layer.clip === state.legs);
  let layer = state.layers.find((entry) => entry.clip === id);
  if (oldLayer) fade(oldLayer, 0, time);
  if (!layer || layer.weight === 0) {
    // A moving loop with no weight keeps the step phase of the moving loop before it, or starts
    // at a time-based phase (clientNum 0); other clips start at 0.
    let phase = 0;
    if (clip.moveSpeed !== 0 && clip.loop) {
      if (old && old.moveSpeed !== 0 && old.loop && oldLayer) phase = oldLayer.phase;
      else {
        const cycle = old ? old.ms + 200 : 1000;
        phase = (((now % cycle) + cycle) % cycle) / cycle;
      }
    }
    layer = addLayer(state, id, phase);
  }
  fade(layer, 1, time);
  state.legs = id;
  if (clip.movetype >= 0) state.clientMovetype = clip.movetype;
}

function setTorso(state: BodyState, now: number, cold: boolean, id: number): void {
  const clip = id >= 0 ? CLIPS[id] : null;
  const old = state.torso >= 0 ? CLIPS[state.torso] : null;
  const time = cold ? 0 : blendTime(state, now, clip, old);
  const oldLayer = state.layers.find((layer) => layer.clip === state.torso);
  if (oldLayer) fade(oldLayer, 0, time);
  if (id >= 0) {
    // Torso anims restart every time they are set.
    const layer = state.layers.find((entry) => entry.clip === id) ?? addLayer(state, id, 0);
    layer.phase = 0;
    layer.rate = 1;
    fade(layer, 1, time);
  }
  fade(state.torsoNode, id >= 0 ? 1 : 0, time);
  fade(state.legsNode, id >= 0 ? 0.01 : 1, time);
  state.torso = id;
}

function addLayer(state: BodyState, clip: number, phase: number): Layer {
  const layer: Layer = { clip, weight: 0, goal: 0, step: 0, phase, rate: 1 };
  state.layers.push(layer);
  if (state.layers.length > MAX_LAYERS) {
    const faintest = state.layers
      .filter((entry) => entry !== layer && entry.goal === 0)
      .reduce<Layer | null>(
        (low, entry) => (!low || entry.weight < low.weight ? entry : low),
        null,
      );
    if (faintest) state.layers.splice(state.layers.indexOf(faintest), 1);
  }
  return layer;
}

/** XAnimSetGoalWeight: the weight moves linearly to `goal` over `time` ms. */
function fade(target: Fade, goal: number, time: number): void {
  target.goal = goal;
  if (time <= 0) {
    target.weight = goal;
    target.step = 0;
  } else {
    target.step = Math.abs(goal - target.weight) / time;
  }
}

function fadeStep(target: Fade, ms: number): void {
  const delta = target.goal - target.weight;
  const move = target.step * ms;
  target.weight = Math.abs(delta) <= move ? target.goal : target.weight + Math.sign(delta) * move;
}

/** BG_RunLerpFrameRate's scale (READY.md §7.4). */
function playbackRate(clip: Clip, speed: number, vertical: number): number {
  if (clip.moveSpeed === 0) return 1;
  const scale = (clip.climb ? vertical : speed) / clip.moveSpeed;
  if (scale < 0.1) return clip.climb && scale < 0.01 ? 0 : 0.1;
  if (scale <= 2) return scale;
  if (clip.climb) return Math.min(scale, 4);
  if (clip.moveSpeed > 150) return 2;
  if (clip.moveSpeed >= 20) return Math.min(scale, 3 - (clip.moveSpeed - 20) / 130);
  return Math.min(scale, 3);
}

/**
 * Advances `state` by `ms` with sample `index`'s commands: timers, fades and clip times, then
 * BG_PlayerAngles' swings toward `view` and the controllers' lerp.
 */
function advance(
  timeline: ReplayTimeline,
  prepared: Prepared,
  index: number,
  state: BodyState,
  ms: number,
  view: View,
): void {
  state.time += ms;
  state.legsTimer = Math.max(0, state.legsTimer - ms);
  state.torsoTimer = Math.max(0, state.torsoTimer - ms);
  for (const layer of state.layers) {
    fadeStep(layer, ms);
    const clip = CLIPS[layer.clip];
    if (clip.ms > 0) {
      const phase = layer.phase + (layer.rate * ms) / clip.ms;
      layer.phase = clip.loop ? phase % 1 : Math.min(1, phase);
    }
  }
  state.layers = state.layers.filter((layer) => layer.weight > 0 || layer.goal > 0);
  fadeStep(state.torsoNode, ms);
  fadeStep(state.legsNode, ms);

  const targets = angles(timeline, prepared, index, state, view, ms);
  if (targets.climbing) {
    state.torsoYaw.angle = targets.legs;
    state.legsYaw.angle = targets.legs;
  }
  const goal = controls(timeline, index, state, view);
  const maxAngle = CONTROL_DEG_PER_MS * ms;
  for (let k = 0; k < 21; k += 1) {
    const diff = goal[k] - state.control[k];
    state.control[k] += Math.max(-maxAngle, Math.min(maxAngle, diff));
  }
  // BG_LerpOffset: along the offset's difference, at most 0.1 in per ms.
  const diff = [21, 22, 23].map((k) => goal[k] - state.control[k]);
  const length = Math.hypot(...diff);
  const scale = length > 0 ? Math.min(1, (CONTROL_INCH_PER_MS * ms) / length) : 0;
  for (let k = 0; k < 3; k += 1) state.control[21 + k] += diff[k] * scale;
}

/**
 * BG_PlayerAngles (READY.md §8.3): swings the torso yaw, legs yaw and torso pitch over `ms`, or,
 * with no `ms`, returns where they head (the settled angles).
 */
function angles(
  timeline: ReplayTimeline,
  prepared: Prepared,
  index: number,
  state: BodyState,
  view: View,
  ms?: number,
): { torso: number; legs: number; pitch: number; climbing: boolean } {
  const events = prepared.events[index];
  const mt = state.clientMovetype;
  const climbing = mt === CLIMBUP || mt === CLIMBDOWN;
  const mantling = prepared.mantle[index] >= 0;
  const prone = timeline.stance[index] === 2;
  const firing = (events & EV_FIRING) !== 0;
  const ads = timeline.aim[index] === AIM_IN;
  const { yaw, moveDir } = view;
  if (climbing || mantling || (mt !== IDLE && mt !== IDLECR)) {
    state.torsoYaw.swinging = true;
    state.torsoPitch.swinging = true;
    state.legsYaw.swinging = true;
  } else if (firing) {
    state.torsoYaw.swinging = true;
    state.torsoPitch.swinging = true;
  }
  let legs = yaw + moveDir;
  let torso: number;
  let clamp = 90;
  if (climbing) {
    torso = legs;
    clamp = 0;
  } else if (mantling) {
    torso = yaw;
    legs = yaw;
  } else if (prone) torso = yaw;
  else if (firing) {
    torso = yaw;
    clamp = 45;
  } else if (ads) torso = yaw;
  else torso = yaw + 0.3 * moveDir;
  const strafe = state.legs >= 0 && CLIPS[state.legs].strafe;
  const pitch = climbing || mantling ? 0 : 0.6 * wrap(view.pitch);
  if (ms !== undefined) {
    swing(state.torsoYaw, torso, 0, clamp, YAW_SWING, ms);
    if (prone) {
      state.legsYaw.swinging = false;
      state.legsYaw.angle = legs;
    } else if (strafe) {
      state.legsYaw.swinging = false;
      swing(state.legsYaw, yaw, 0, 150, YAW_SWING, ms);
    } else {
      swing(state.legsYaw, legs, state.legsYaw.swinging ? 0 : 40, 150, YAW_SWING, ms);
    }
    swing(state.torsoPitch, pitch, 0, 45, PITCH_SWING, ms);
  }
  return { torso, legs: strafe && !prone ? yaw : legs, pitch, climbing };
}

/** BG_SwingAngles (READY.md §8.2). */
function swing(
  target: Swing,
  dest: number,
  tolerance: number,
  clamp: number,
  speed: number,
  ms: number,
): void {
  if (!target.swinging && Math.abs(angleSub(target.angle, dest)) > tolerance) {
    target.swinging = true;
  }
  if (!target.swinging) return;
  const delta = angleSub(dest, target.angle);
  const move = ms * Math.max(0.5, Math.abs(delta) * 0.05) * speed;
  if (move >= Math.abs(delta)) {
    target.angle = dest;
    target.swinging = false;
  } else {
    target.angle = wrap(target.angle + Math.sign(delta) * move);
  }
  const off = angleSub(dest, target.angle);
  if (off > clamp) target.angle = wrap(dest - clamp);
  else if (off < -clamp) target.angle = wrap(dest + clamp);
}

/**
 * BG_Player_DoControllersInternal (READY.md §8.5): the six controllers' angles, then tag_origin's
 * angles and offset, for the current yaws and pitch.
 */
function controls(timeline: ReplayTimeline, index: number, state: BodyState, view: View): number[] {
  const stance = timeline.stance[index];
  const climbing = state.clientMovetype === CLIMBUP || state.clientMovetype === CLIMBDOWN;
  const legsYaw = state.legsYaw.angle;
  const torsoYaw = state.torsoYaw.angle;
  let tp = climbing ? 0 : wrap(state.torsoPitch.angle);
  if (stance === 2 && !climbing) tp *= tp > 0 ? 0.5 : 0.25;
  const hp = angleSub(view.pitch, tp);
  const hy = angleSub(view.yaw, torsoYaw);
  const ty = angleSub(torsoYaw, legsYaw);
  const lean = leanFraction(view.lean);
  let roll = lean * 50 * 0.925;
  let headRoll = roll;
  const offset = [0, 0, 0];
  if (lean !== 0) offset[1] = lean > 0 ? -2.5 * lean : (stance === 1 ? -12.5 : -5) * lean;
  const origin = [0, angleSub(legsYaw, view.yaw), 0];
  let low: number[];
  let mid: number[];
  let up: number[];
  if (stance === 2) {
    if (lean !== 0) headRoll *= 0.5;
    const radians = (ty * Math.PI) / 180;
    const [s, c] = [Math.sin(radians), Math.cos(radians)];
    offset[0] += -24 * (1 - c);
    offset[1] += -12 * s;
    if (lean * s > 0) offset[1] += -lean * (1 - c) * 16;
    low = [0, -1.2 * roll, 0.3 * roll];
    mid = [0, 0.1 * ty - 0.2 * roll, 0.2 * roll];
    up = [tp, 0.8 * ty + roll, -0.2 * roll];
  } else {
    if (lean !== 0 && (stance !== 1 || lean <= 0)) {
      roll *= 1.25;
      headRoll *= 1.25;
    }
    origin[2] = lean * 50 * 0.075;
    low = [0.2 * tp, 0.4 * ty, 0.5 * roll];
    mid = [0.3 * tp, 0.4 * ty, 0.5 * roll];
    up = [0.5 * tp, 0.2 * ty, -0.6 * roll];
  }
  const neck = [0.3 * hp, 0.3 * hy, 0];
  const head = [0.7 * hp, 0.7 * hy, -0.3 * headRoll];
  return [0, 0, 0, ...low, ...mid, ...up, ...neck, ...head, ...origin, ...offset];
}

/**
 * The mixer weights (READY.md §7.3): each legs-subtree clip w / Σw of its node, each torso-subtree
 * clip (W_torso / W_legs) × w / Σw of its node; three.js normalizes per bone like XAnimCalc.
 */
function mixerWeights(state: BodyState): ViewmodelAnim[] {
  let legs = 0;
  let torso = 0;
  for (const layer of state.layers) {
    if (CLIPS[layer.clip].torsoTree) torso += layer.weight;
    else legs += layer.weight;
  }
  const nodes = state.torsoNode.weight / Math.max(state.legsNode.weight, 1e-6);
  const anims: ViewmodelAnim[] = [];
  for (const layer of state.layers) {
    const clip = CLIPS[layer.clip];
    const weight = clip.torsoTree
      ? torso > 0
        ? (nodes * layer.weight) / torso
        : 0
      : legs > 0
        ? layer.weight / legs
        : 0;
    if (weight > 0) anims.push({ clip: clip.name, time: (layer.phase * clip.ms) / 1000, weight });
  }
  return anims;
}

function cloneState(state: BodyState): BodyState {
  return {
    ...state,
    layers: state.layers.map((layer) => ({ ...layer })),
    torsoNode: { ...state.torsoNode },
    legsNode: { ...state.legsNode },
    torsoYaw: { ...state.torsoYaw },
    legsYaw: { ...state.legsYaw },
    torsoPitch: { ...state.torsoPitch },
    control: state.control.slice(),
  };
}

/** 0 standing, 1 crouching, 2 prone movetypes (BG_IsCrouchingAnim, BG_IsProneAnim). */
function stanceClass(movetype: number): number {
  return CROUCH_MOVETYPES.includes(movetype) ? 1 : PRONE_MOVETYPES.includes(movetype) ? 2 : 0;
}

/** AngleSubtract: a - b wrapped to [-180, 180). */
function angleSub(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

function wrap(angle: number): number {
  return angleSub(angle, 0);
}

/** A per-sample pick standing in for rand(). */
function hash(index: number): number {
  return Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) >>> 16;
}
