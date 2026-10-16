import { describe, expect, it } from "vitest";
import type { ReplayMarker, ReplaySamples } from "../../lib/api";
import { createTimeline } from "./replayPlayback";
import {
  fallHeight,
  landingTables,
  parseSoundManifest,
  pickVariant,
  soundEvents,
  startCursor,
  surfaceName,
  variantsFor,
  type FootstepRules,
  type SoundContext,
  type SoundVariant,
} from "./replaySound";

const rules: FootstepRules = {
  assumedMsec: 8,
  gSpeed: 190,
  dirScale: { forward: 1, back: 0.7, strafe: 0.85, forwardDiagonal: 0.925, backDiagonal: 0.78625 },
  k: { stand: 0.335, standBackwards: 0.36, crouch: 0.34, prone: 0.25 },
  stanceScale: { stand: 1, crouch: 0.65, prone: 0.15 },
  skipLadderAfterJumpMs: 300,
};

interface Row {
  t: number;
  z?: number;
  vel?: [number, number, number];
  flags?: number;
  input?: number;
  aux?: number;
}

function replay(rows: Row[], markers: ReplayMarker[] = [], fps = 125): ReplaySamples {
  return {
    run_id: 1,
    mapname: "jm_test",
    player_id: 2,
    playername: "Runner",
    format_version: 11,
    tick_ms: 50,
    duration_ms: rows.at(-1)?.t ?? 0,
    finished: true,
    t: rows.map((row) => row.t),
    // Constant-speed rows move along x so no segment looks like a teleport.
    pos: rows.flatMap((row) => [((row.vel?.[0] ?? 0) * row.t) / 1000, 0, row.z ?? 0]),
    ang: rows.flatMap(() => [0, 0, 0]),
    vel: rows.flatMap((row) => row.vel ?? [0, 0, 0]),
    stance: rows.map(() => 0),
    flags: rows.map((row) => row.flags ?? 0),
    input: rows.map((row) => row.input ?? 0),
    aux: rows.map((row) => row.aux ?? 0),
    run_fps: fps,
    markers,
  };
}

function context(samples: ReplaySamples, surface: string | null = "wood"): SoundContext {
  return { timeline: createTimeline(samples), rules, surfaceAt: () => surface };
}

function run(samples: ReplaySamples, to: number, surface: string | null = "wood") {
  return soundEvents(context(samples, surface), startCursor(samples.t[0]), to).events;
}

describe("landing (PM_CrashLand)", () => {
  it("computes the impact height from the last airborne sample", () => {
    expect(fallHeight(100, 60, 0)).toBe(40);
    // Still rising at 200 u/s when the ground comes up 20 units higher: no real impact.
    expect(fallHeight(0, 40, 100)).toBeNull();
    expect(fallHeight(10, 0, -400)).toBeCloseTo(10 + 100);
  });

  it.each([
    [3, "wood", []],
    [6, "wood", ["footstepWalk.wood", "gearRattleWalk"]],
    [10, "wood", ["footstep.wood", "gearRattleRun"]],
    [20, "wood", ["land.wood"]],
    [6, null, []],
    [20, null, ["land.default"]],
    [null, "wood", []],
  ] as const)("a %s-unit fall on %s plays %j", (height, surface, tables) => {
    expect(landingTables(height, surface)).toEqual(tables);
  });

  it("fires at the first grounded sample and never across a load", () => {
    const rows: Row[] = [
      { t: 0, z: 40, flags: 4, vel: [0, 0, -400] },
      { t: 50, z: 0, flags: 0 },
    ];
    expect(run(replay(rows), 60)).toEqual([{ t: 50, kind: "land", tables: ["land.wood"] }]);
    expect(run(replay(rows, [{ t: 50, kind: "load" }]), 60)).toEqual([]);
  });
});

describe("footsteps (PM_Footsteps)", () => {
  const running = (fps: number) =>
    replay(
      [0, 250, 500, 750, 1000, 1250].map((t) => ({
        t,
        vel: [190, 0, 0] as [number, number, number],
        input: 32,
      })),
      [],
      fps,
    );

  it("steps when the bob cycle crosses 64 and 192 at a known speed", () => {
    // 125 fps: trunc(cycle + 190/190 * 0.335 * 8) adds 2 per 8 ms frame.
    const steps = run(running(125), 1024).filter((event) => event.kind === "step");
    expect(steps.map((event) => event.t)).toEqual([256, 768]);
    expect(steps[0].tables).toEqual(["footstep.wood", "gearRattleRun"]);
  });

  it("follows the configured fps, so 333 fps steps faster than 125", () => {
    // 333 fps (3 ms): trunc(1.005) adds 1 per frame, 333 frames a second.
    const steps = run(running(333), 1000).filter((event) => event.kind === "step");
    expect(steps.map((event) => event.t)).toEqual([192, 576, 960]);
  });

  it("is silent when crouched or on a type-0 surface", () => {
    const crouched = {
      ...running(125),
      flags: running(125).flags?.map(() => 1),
      stance: [1, 1, 1, 1, 1, 1],
    };
    expect(run(crouched, 1024)).toEqual([]);
    expect(run(running(125), 1024, null)).toEqual([]);
  });

  it("keeps the cycle running but stays silent while sliding with no move keys", () => {
    const sliding = replay(
      [0, 250, 500, 750, 1000, 1250].map((t) => ({
        t,
        vel: [190, 0, 0] as [number, number, number],
        input: t < 500 ? 0 : 32,
      })),
    );
    // The 64 crossing at 256 ms is silent (no keys); the cycle kept advancing, so the next step
    // lands at 768 ms rather than 756 ms (256 ms after the key went down at 500 ms).
    const steps = run(sliding, 1024).filter((event) => event.kind === "step");
    expect(steps.map((event) => event.t)).toEqual([768]);
  });

  it("can be resumed from its cursor without losing or repeating steps", () => {
    const samples = running(125);
    const first = soundEvents(context(samples), startCursor(0), 500);
    const second = soundEvents(context(samples), first.cursor, 1024);
    expect([...first.events, ...second.events].map((event) => event.t)).toEqual([256, 768]);
  });
});

describe("jumps, ladders, and weapon raises", () => {
  it("plays the takeoff surface on a jump and wood off a ladder", () => {
    const jump = replay([
      { t: 0, flags: 0 },
      { t: 50, flags: 4, vel: [0, 0, 250], input: 2 },
    ]);
    expect(run(jump, 60)).toEqual([
      { t: 50, kind: "jump", tables: ["footstep.wood", "gearRattleRun"] },
    ]);
    const walkOff = replay([
      { t: 0, flags: 0 },
      { t: 50, flags: 4 },
    ]);
    expect(run(walkOff, 60)).toEqual([]);
    const offLadder = replay([
      { t: 0, flags: 4, aux: 1 },
      { t: 50, flags: 4, aux: 0, vel: [0, 0, 250], input: 2 },
    ]);
    expect(run(offLadder, 60)).toMatchObject([
      { kind: "jump", tables: ["ladder", "gearRattleRun"] },
    ]);
  });

  it("steps up a ladder at the climb cadence", () => {
    const climb = replay(
      [0, 250, 500, 750, 1000, 1250].map((t) => ({
        t,
        flags: 4,
        aux: 1,
        vel: [0, 0, 95.25] as [number, number, number],
      })),
    );
    // vz / 95.25 * 0.45 * 8 ms = 3.6, so +3 per frame: crossings at frames 22, 64, and 107 (321 & 255 = 65).
    const steps = run(climb, 1024).filter((event) => event.kind === "ladder");
    expect(steps.map((event) => event.t)).toEqual([176, 512, 856]);
    expect(steps[0].tables).toEqual(["ladder", "gearRattleRun"]);
  });

  it("raises the weapon on a switch into slot 0 or 1, not into the grenade or none", () => {
    const switches = replay([
      { t: 0, aux: 6 },
      { t: 50, aux: 0 },
      { t: 100, aux: 2 },
      { t: 150, aux: 4 },
      { t: 200, aux: 6 },
    ]);
    expect(run(switches, 210).filter((event) => event.kind === "raise")).toEqual([
      { t: 50, kind: "raise", tables: ["raise.0", "raiseSecondary.0"] },
      { t: 100, kind: "raise", tables: ["raise.1", "raiseSecondary.1"] },
    ]);
  });
});

describe("variants and manifest", () => {
  const variant = (file: string | null, weight = 1): SoundVariant => ({
    file,
    volume: [0.5, 0.5],
    pitch: [1, 1],
    weight,
  });

  it("never repeats the last pick when there are more than two variants", () => {
    const three = [variant("a"), variant("b"), variant("c")];
    // A roll that would land on the last pick moves on to the next allowed variant.
    expect(pickVariant(three, 0, () => 0)).toBe(1);
    expect(pickVariant(three, 2, () => 0.99)).toBe(1);
    expect(pickVariant([variant("a"), variant("b")], 0, () => 0)).toBe(0);
    // Weights: the null (silent) variant takes 6 of 7 parts.
    expect(pickVariant([variant("a"), variant(null, 6)], undefined, () => 0.5)).toBe(1);
  });

  it("parses the asset and resolves tables with the default fallback", () => {
    const manifest = parseSoundManifest({
      fallback: "default",
      surfaceTypes: ["none", "bark", "wood"],
      footstep: { default: [{ file: "d.wav", volume: [0.1, 0.2], pitch: [1, 1] }] },
      land: { wood: [{ file: "w.wav", volume: [0.5, 0.6], pitch: [0.9, 0.9] }] },
      gearRattleRun: [{ file: null, volume: [0.1, 0.1], pitch: [0.9, 0.9], weight: 6 }],
      weapon: {
        slots: { 0: "luger_mp2" },
        luger_mp2: { raise: [{ file: "r.wav", volume: [0.4, 0.5], pitch: [0.9, 1.2] }] },
      },
      rules: { footsteps: { assumedMsec: 8, gSpeed: { codjumper: 190 } }, ladder: {} },
    });
    expect(manifest).not.toBeNull();
    if (!manifest) return;
    expect(variantsFor(manifest, "footstep.wood")[0].file).toBe("d.wav");
    expect(variantsFor(manifest, "land.wood")[0].file).toBe("w.wav");
    expect(variantsFor(manifest, "gearRattleRun")[0]).toMatchObject({ file: null, weight: 6 });
    expect(variantsFor(manifest, "raise.0")[0].file).toBe("r.wav");
    expect(surfaceName(manifest, 2 << 20)).toBe("wood");
    expect(surfaceName(manifest, (2 << 20) | 0x2000)).toBeNull();
    expect(surfaceName(manifest, 0)).toBeNull();
    expect(parseSoundManifest({ rules: [] })).toBeNull();
  });
});
