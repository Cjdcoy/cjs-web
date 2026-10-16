import { fpsAt } from "./replayHudModel";
import { findSampleIndex, sampleVelocity, type ReplayTimeline } from "./replayPlayback";

/**
 * Replay sound events, following the engine rules recorded in the sound manifest (sounds.json
 * rules.*.notes: PM_CrashLand, PM_Footsteps, Jump_Check, the ladder path, and weapon raise).
 * Everything here is pure: the player turns events into Web Audio playback.
 */

export interface SoundVariant {
  file: string | null;
  volume: readonly [number, number];
  pitch: readonly [number, number];
  weight: number;
}

export interface SoundManifest {
  surfaceTypes: readonly string[];
  fallback: string;
  footstep: Readonly<Record<string, SoundVariant[]>>;
  footstepWalk: Readonly<Record<string, SoundVariant[]>>;
  land: Readonly<Record<string, SoundVariant[]>>;
  gearRattleRun: SoundVariant[];
  gearRattleWalk: SoundVariant[];
  ladder: SoundVariant[];
  /** Raise sounds by weapon slot (0 primary, 1 primaryb). */
  raise: Readonly<Record<string, SoundVariant[]>>;
  raiseSecondary: Readonly<Record<string, SoundVariant[]>>;
  rules: FootstepRules;
}

export interface FootstepRules {
  assumedMsec: number;
  gSpeed: number;
  dirScale: Readonly<Record<string, number>>;
  k: Readonly<Record<string, number>>;
  stanceScale: Readonly<Record<string, number>>;
  skipLadderAfterJumpMs: number;
}

export type SoundEventKind = "land" | "step" | "jump" | "ladder" | "raise";

/** One sound moment: the variant tables to play together, e.g. ["footstep.wood", "gearRattleRun"]. */
export interface SoundEvent {
  t: number;
  kind: SoundEventKind;
  tables: string[];
}

/** Where the simulation stopped: the last pmove frame, the bob cycle, and the last jump. */
export interface SoundCursor {
  time: number;
  cycle: number;
  lastJumpTime: number;
}

export interface SoundContext {
  timeline: ReplayTimeline;
  rules: FootstepRules;
  /** Surface name under sample `index`, or null for type 0 / no steps (silent footsteps). */
  surfaceAt: (index: number) => string | null;
}

const GRAVITY = 800;
const IN_AIR = 4;
const ON_LADDER = 1;
const JUMP_KEY = 2;
const JUMP_SPEED = 150; // u/s upward: a J4L jump leaves at ~250, walking off a ledge at ~0
// Ladder bob: vz / 95.25 * 0.45 per ms (sounds.json rules.ladder.bobmove).
const LADDER_SPEED = 95.25;
const LADDER_K = 0.45;
const INPUT_FORWARD = 32;
const INPUT_BACK = 64;
const INPUT_SIDE = 128 | 256;
const MOVE_KEYS = INPUT_FORWARD | INPUT_BACK | INPUT_SIDE;

export function startCursor(time: number): SoundCursor {
  return { time, cycle: 0, lastJumpTime: -Infinity };
}

/**
 * Events in (cursor.time, to], simulated one pmove frame at a time like the client: msec is the
 * configured fps's frame time, and the bob cycle advances by trunc(cycle + bobmove * msec) & 255,
 * stepping when it crosses 64 or 192. Sample transitions add landings, jumps, and weapon raises;
 * nothing fires across a load or teleport. Replays without flags produce no movement sounds.
 */
export function soundEvents(
  context: SoundContext,
  cursor: SoundCursor,
  to: number,
): { events: SoundEvent[]; cursor: SoundCursor } {
  const { timeline, rules } = context;
  const { samples } = timeline;
  const events: SoundEvent[] = [];
  let { cycle, lastJumpTime, time } = cursor;
  if (!samples.flags) return { events, cursor: { ...cursor, time: Math.max(time, to) } };
  const { flags } = samples;
  let previousIndex = findSampleIndex(samples.t, time);
  // The frame time follows the configured fps, which only changes at fps markers.
  const fps = fpsAt(samples, to);
  const msec = fps ? Math.round(1000 / fps) : rules.assumedMsec;

  for (;;) {
    const next = time + msec;
    if (next > to) break;
    time = next;
    const index = findSampleIndex(samples.t, time);

    for (let sample = previousIndex + 1; sample <= index; sample += 1) {
      if (timeline.snap[sample - 1] === 1) {
        cycle = 0;
        continue;
      }
      const transition = transitionEvents(context, sample);
      if (transition.jumped) lastJumpTime = samples.t[sample];
      events.push(...transition.events);
    }
    previousIndex = index;

    const [vx, vy, vz] = sampleVelocity(timeline, time);
    const previousCycle = cycle;
    if ((flags[index] & IN_AIR) === 0) {
      const speed = Math.hypot(vx, vy);
      if (speed < 1) cycle = 0;
      else if (speed >= 10) {
        cycle = advance(
          cycle,
          (speed / footstepScale(context, index)) * footstepK(context, index),
          msec,
        );
      }
      // PM_Footsteps advances the cycle even without move keys, then returns before the step
      // event, so sliding with no forward or side key held is silent. Older replays without input
      // are treated as holding a key.
      const moving = samples.input ? (samples.input[index] & MOVE_KEYS) !== 0 : true;
      const surface =
        moving && crossed(previousCycle, cycle) && timeline.stance[index] === 0
          ? context.surfaceAt(index)
          : null;
      if (surface)
        events.push({ t: time, kind: "step", tables: [`footstep.${surface}`, "gearRattleRun"] });
    } else if ((samples.aux?.[index] ?? 0) & ON_LADDER) {
      if (time - lastJumpTime < rules.skipLadderAfterJumpMs) continue;
      cycle = advance(cycle, (vz / LADDER_SPEED) * LADDER_K, msec);
      // ponytail: ladder steps use the wood list; the engine box-traces the ladder brush's surface.
      if (crossed(previousCycle, cycle)) {
        events.push({ t: time, kind: "ladder", tables: ["ladder", "gearRattleRun"] });
      }
    }
  }

  return { events, cursor: { time, cycle, lastJumpTime } };
}

/** Landing, jump, and weapon-raise events between sample - 1 and sample. */
function transitionEvents(
  context: SoundContext,
  sample: number,
): { events: SoundEvent[]; jumped: boolean } {
  const { samples } = context.timeline;
  const flags = samples.flags ?? [];
  const before = sample - 1;
  const t = samples.t[sample];
  const events: SoundEvent[] = [];
  const wasAir = (flags[before] & IN_AIR) !== 0;
  const isAir = (flags[sample] & IN_AIR) !== 0;

  if (wasAir && !isAir) {
    const tables = landingTables(
      fallHeight(
        samples.pos[before * 3 + 2],
        samples.pos[sample * 3 + 2],
        samples.vel[before * 3 + 2],
      ),
      context.surfaceAt(sample),
    );
    if (tables.length) events.push({ t, kind: "land", tables });
  }

  const aux = samples.aux;
  const wasLadder = ((aux?.[before] ?? 0) & ON_LADDER) !== 0;
  const leftGround = !wasAir && isAir;
  const leftLadder = wasLadder && ((aux?.[sample] ?? 0) & ON_LADDER) === 0 && isAir;
  const jumpHeld = ((samples.input?.[sample] ?? 0) & JUMP_KEY) !== 0;
  const jumped =
    (leftGround || leftLadder) && (jumpHeld || samples.vel[sample * 3 + 2] > JUMP_SPEED);
  // Jumping off a ladder sounds like wood (the "ladder" list); a type-0 surface is silent.
  const surface = jumped && !wasLadder ? context.surfaceAt(before) : null;
  if (jumped && (wasLadder || surface)) {
    const step = wasLadder ? "ladder" : `footstep.${surface}`;
    events.push({ t, kind: "jump", tables: [step, "gearRattleRun"] });
  }

  if (aux) {
    const from = (aux[before] >> 1) & 3;
    const into = (aux[sample] >> 1) & 3;
    // Putaway is silent and the offhand grenade (slot 2) is skipped.
    if (into !== from && (into === 0 || into === 1)) {
      events.push({ t, kind: "raise", tables: [`raise.${into}`, `raiseSecondary.${into}`] });
    }
  }

  return { events, jumped };
}

/**
 * PM_CrashLand's fall height from the last airborne sample (z, upward vz) to the first grounded one,
 * or null when the engine plays nothing (no real impact).
 */
export function fallHeight(airZ: number, groundZ: number, airVz: number): number | null {
  const drop = airZ - groundZ;
  if (airVz * airVz + 2 * GRAVITY * drop < 0) return null;
  return drop + (airVz * airVz) / (2 * GRAVITY);
}

/**
 * PM_CrashLand tiers: silent up to 4, walk step to 8, run step to 12, then the land sound. Surface
 * type 0 silences the step tiers and lands on land.default.
 * ponytail: the pain tier is skipped; it depends on server fall-damage dvars a replay doesn't record.
 */
export function landingTables(height: number | null, surface: string | null): string[] {
  if (height === null || height <= 4) return [];
  if (height >= 12) return [`land.${surface ?? "default"}`];
  if (!surface) return [];
  return height < 8
    ? [`footstepWalk.${surface}`, "gearRattleWalk"]
    : [`footstep.${surface}`, "gearRattleRun"];
}

function footstepScale(context: SoundContext, index: number): number {
  const { rules, timeline } = context;
  const input = timeline.samples.input?.[index] ?? 0;
  const forward = (input & INPUT_FORWARD) !== 0;
  const back = (input & INPUT_BACK) !== 0;
  const side = (input & INPUT_SIDE) !== 0;
  // With no move keys the engine scales by the plain speed, the same as forward.
  const direction =
    back && side
      ? "backDiagonal"
      : back
        ? "back"
        : forward && side
          ? "forwardDiagonal"
          : side
            ? "strafe"
            : "forward";
  const stance = STANCES[timeline.stance[index]] ?? "stand";
  return rules.gSpeed * (rules.dirScale[direction] ?? 1) * (rules.stanceScale[stance] ?? 1);
}

function footstepK(context: SoundContext, index: number): number {
  const { rules, timeline } = context;
  const stance = STANCES[timeline.stance[index]] ?? "stand";
  const backpedal = ((timeline.samples.input?.[index] ?? 0) & INPUT_BACK) !== 0;
  const key = stance === "stand" && backpedal ? "standBackwards" : stance;
  return rules.k[key] ?? rules.k.stand ?? 0.335;
}

const STANCES = ["stand", "crouch", "prone"] as const;

function advance(cycle: number, bobPerMs: number, msec: number): number {
  return Math.trunc(cycle + bobPerMs * msec) & 255;
}

/** ((new + 64) ^ (old + 64)) & 128: the cycle crossed 64 or 192. */
function crossed(previous: number, next: number): boolean {
  return (((next + 64) ^ (previous + 64)) & 128) !== 0;
}

/** Variants for a table id such as "footstep.wood", falling back to the default surface. */
export function variantsFor(manifest: SoundManifest, id: string): SoundVariant[] {
  const [table, key] = id.split(".");
  switch (table) {
    case "footstep":
    case "footstepWalk":
    case "land":
    case "raise":
    case "raiseSecondary": {
      const entries = manifest[table];
      return entries[key] ?? entries[manifest.fallback] ?? [];
    }
    case "gearRattleRun":
    case "gearRattleWalk":
    case "ladder":
      return manifest[table];
    default:
      return [];
  }
}

/**
 * Weighted pick (weight defaults to 1). With more than two variants the last pick is never repeated,
 * like Com_PickSoundAliasFromList. `random` returns [0, 1).
 */
export function pickVariant(
  variants: readonly SoundVariant[],
  lastIndex: number | undefined,
  random: () => number,
): number {
  const allowed = variants.map((_, index) => !(variants.length > 2 && index === lastIndex));
  const total = variants.reduce(
    (sum, variant, index) => sum + (allowed[index] ? variant.weight : 0),
    0,
  );
  let roll = random() * total;
  for (let index = 0; index < variants.length; index += 1) {
    if (!allowed[index]) continue;
    roll -= variants[index].weight;
    if (roll < 0) return index;
  }
  return allowed.lastIndexOf(true);
}

/** Validates the sounds.json asset; null when it is not usable. */
export function parseSoundManifest(value: unknown): SoundManifest | null {
  if (!isRecord(value) || !isRecord(value.rules) || !isRecord(value.rules.footsteps)) return null;
  const footsteps = value.rules.footsteps;
  const ladder = isRecord(value.rules.ladder) ? value.rules.ladder : {};
  const weapon = isRecord(value.weapon) ? value.weapon : {};
  const slots = isRecord(weapon.slots) ? weapon.slots : {};
  const raise: Record<string, SoundVariant[]> = {};
  const raiseSecondary: Record<string, SoundVariant[]> = {};
  for (const [slot, name] of Object.entries(slots)) {
    const entry = typeof name === "string" && isRecord(weapon[name]) ? weapon[name] : null;
    if (!entry) continue;
    raise[slot] = variantList(entry.raise);
    raiseSecondary[slot] = variantList(entry.raiseSecondary);
  }
  const gSpeed = isRecord(footsteps.gSpeed) ? footsteps.gSpeed.codjumper : undefined;
  const surfaceTypes = Array.isArray(value.surfaceTypes)
    ? value.surfaceTypes.map((name) => (typeof name === "string" ? name : ""))
    : [];

  return {
    surfaceTypes,
    fallback: typeof value.fallback === "string" ? value.fallback : "default",
    footstep: variantTables(value.footstep),
    footstepWalk: variantTables(value.footstepWalk),
    land: variantTables(value.land),
    gearRattleRun: variantList(value.gearRattleRun),
    gearRattleWalk: variantList(value.gearRattleWalk),
    ladder: variantList(value.ladder),
    raise,
    raiseSecondary,
    rules: {
      assumedMsec: positive(footsteps.assumedMsec, 8),
      gSpeed: positive(gSpeed, 190),
      dirScale: numberRecord(footsteps.dirScale),
      k: numberRecord(footsteps.k),
      stanceScale: numberRecord(footsteps.stanceScale),
      skipLadderAfterJumpMs: positive(ladder.skipAfterJumpMs, 300),
    },
  };
}

/** Surface table name for raw surfaceFlags: (flags >> 20) & 31, or null for type 0 / NOSTEPS. */
export function surfaceName(manifest: SoundManifest, surfaceFlags: number | null): string | null {
  if (surfaceFlags === null || surfaceFlags & 0x2000) return null;
  const type = (surfaceFlags >> 20) & 31;
  return type === 0 ? null : (manifest.surfaceTypes[type] ?? manifest.fallback) || null;
}

function variantTables(value: unknown): Record<string, SoundVariant[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, list]) => [key, variantList(list)]));
}

function variantList(value: unknown): SoundVariant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SoundVariant[] => {
    if (!isRecord(entry)) return [];
    const volume = range(entry.volume);
    const pitch = range(entry.pitch);
    if (!volume || !pitch) return [];
    const file = typeof entry.file === "string" ? entry.file : null;
    return [{ file, volume, pitch, weight: positive(entry.weight, 1) }];
  });
}

function range(value: unknown): readonly [number, number] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
    ? [value[0] as number, value[1] as number]
    : null;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
