import { describe, expect, it } from "vitest";
import type { ReplayMarker, ReplaySamples } from "../../lib/api";
import {
  addLean,
  adsAt,
  createTimeline,
  effectiveStance,
  eyeHeight,
  findMarker,
  findSampleIndex,
  formatReplayClock,
  formatReplayClockMs,
  hermite,
  leanAt,
  leanStep,
  lerpAngle,
  pathSegments,
  sampleMotion,
  samplePose,
  stepSampleTime,
} from "./replayPlayback";

function samples(
  rows: { t: number; pos: [number, number, number]; vel?: [number, number, number] }[],
  markers: ReplayMarker[] = [],
  stance: number[] = rows.map(() => 0),
): ReplaySamples {
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
    pos: rows.flatMap((row) => row.pos),
    ang: rows.flatMap(() => [0, 90, 0]),
    vel: rows.flatMap((row) => row.vel ?? [0, 0, 0]),
    stance,
    markers,
  };
}

describe("replay interpolation", () => {
  it("follows the velocity tangents at the Hermite midpoint", () => {
    expect(hermite(0, 0, 10, 0, 0.5, 1)).toBe(5);
    // Jump apex: rising then falling at 200 u/s over 0.1 s bulges above the straight line.
    expect(hermite(0, 200, 0, -200, 0.5, 0.1)).toBeCloseTo(5);
  });

  it("interpolates angles along the shortest arc across the ±180 seam", () => {
    expect(lerpAngle(170, -170, 0.5)).toBe(180);
    expect(lerpAngle(-170, 170, 0.25)).toBe(-175);
    expect(lerpAngle(10, 30, 0.5)).toBe(20);
    expect(lerpAngle(350, 10, 0.5)).toBe(0);
  });

  it("eases the eye height through a stand to crouch change like CoD2", () => {
    const timeline = createTimeline(
      samples(
        [
          { t: 0, pos: [0, 0, 0], vel: [200, 0, 0] },
          { t: 100, pos: [20, 0, 0], vel: [200, 0, 0] },
        ],
        [],
        [0, 1],
      ),
    );

    const pose = samplePose(timeline, 50);
    expect(pose.x).toBeCloseTo(10);
    expect(pose.z).toBe(60);
    // The change starts at the first crouched sample (t = 100) and takes 200 ms.
    expect(samplePose(timeline, 200).z).toBeCloseTo(51.2);
    expect(samplePose(timeline, 300).z).toBe(40);
    expect(samplePose(timeline, 900).z).toBe(40);
  });

  it("dips and rebounds when going prone, and lands mid-transition after a seek", () => {
    const rows = [0, 50, 100, 150, 200].map((t) => ({
      t,
      pos: [0, 0, 0] as [number, number, number],
    }));
    const replay = { ...samples(rows, [], [1, 1, 2, 2, 2]), flags: [1, 1, 1, 1, 1] };
    const timeline = createTimeline(replay);

    // Crouch to prone starts at t = 100 and takes 400 ms: 15 at 50%, back up to 18 at 70%.
    expect(eyeHeight(timeline, 300)).toBeCloseTo(15);
    expect(eyeHeight(timeline, 380)).toBeCloseTo(18);
    // Evaluated from the timeline alone, so jumping straight to 25% needs no history.
    expect(eyeHeight(timeline, 200)).toBeCloseTo(33 - (8 * 3) / 12);
    expect(eyeHeight(timeline, 500)).toBe(11);
  });

  it("follows the actual stance flag, not a held crouch key", () => {
    const rows = [0, 50, 100].map((t) => ({ t, pos: [0, 0, 0] as [number, number, number] }));
    const keyOnly = createTimeline({ ...samples(rows, [], [1, 1, 1]), flags: [0, 0, 0] });
    expect(eyeHeight(keyOnly, 100)).toBe(60);
    const proneKeyCrouched = { ...samples(rows, [], [0, 0, 0]), flags: [1, 1, 1] };
    expect(effectiveStance(proneKeyCrouched, 0)).toBe(1);
    expect(effectiveStance({ ...proneKeyCrouched, stance: [2, 2, 2] }, 0)).toBe(2);
  });

  it("sets the height directly when the stance changes across a load", () => {
    const timeline = createTimeline(
      samples(
        [
          { t: 0, pos: [0, 0, 0] },
          { t: 50, pos: [500, 0, 0] },
        ],
        [{ t: 50, kind: "load" }],
        [0, 1],
      ),
    );
    expect(eyeHeight(timeline, 60)).toBe(40);
  });

  it("interpolates velocity and yaw for per-frame HUD motion", () => {
    const replay = samples([
      { t: 0, pos: [0, 0, 0], vel: [100, 0, 0] },
      { t: 100, pos: [15, 0, 0], vel: [200, 50, 0] },
    ]);
    replay.ang = [0, 170, 0, 0, -170, 0];
    const motion = sampleMotion(createTimeline(replay), 50);
    expect(motion).toEqual({ velX: 150, velY: 25, yaw: 180 });
    expect(sampleMotion(createTimeline(replay), 500)).toEqual({ velX: 200, velY: 50, yaw: -170 });
  });

  it("keeps every path point of a 20 Hz replay with 49-51 ms jitter", () => {
    const times = [0, 49, 100, 151, 200, 249, 300];
    const timeline = createTimeline(
      samples(times.map((t) => ({ t, pos: [t, 0, 0], vel: [1000, 0, 0] }))),
    );

    expect(pathSegments(timeline)).toEqual(
      times.slice(1).flatMap((t, index) => [times[index], 0, 0, t, 0, 0]),
    );
  });

  it("does not interpolate across a load marker", () => {
    const timeline = createTimeline(
      samples(
        [
          { t: 0, pos: [0, 0, 0], vel: [100, 0, 0] },
          { t: 100, pos: [5, 0, 0], vel: [100, 0, 0] },
          { t: 200, pos: [15, 0, 0], vel: [100, 0, 0] },
        ],
        [{ t: 100, kind: "load" }],
      ),
    );

    expect(Array.from(timeline.snap)).toEqual([1, 0]);
    expect(pathSegments(timeline)).toEqual([5, 0, 0, 15, 0, 0]);
    expect(samplePose(timeline, 99).x).toBe(0);
    expect(samplePose(timeline, 100).x).toBe(5);
    expect(samplePose(timeline, 150).x).toBeCloseTo(10);
  });

  it("snaps across a teleport that the sampled velocity cannot explain", () => {
    const timeline = createTimeline(
      samples([
        { t: 0, pos: [0, 0, 0], vel: [10, 0, 0] },
        { t: 50, pos: [2000, 0, 0], vel: [10, 0, 0] },
      ]),
    );

    expect(timeline.snap[0]).toBe(1);
    expect(samplePose(timeline, 40).x).toBe(0);
  });

  it("finds samples by binary search and clamps outside the replay", () => {
    const t = [0, 50, 50, 100, 400];
    expect(findSampleIndex(t, -10)).toBe(0);
    expect(findSampleIndex(t, 0)).toBe(0);
    expect(findSampleIndex(t, 49)).toBe(0);
    expect(findSampleIndex(t, 50)).toBe(2);
    expect(findSampleIndex(t, 399)).toBe(3);
    expect(findSampleIndex(t, 9_000)).toBe(4);
    expect(findSampleIndex([], 10)).toBe(-1);
  });

  it("steps one sample forward or back and clamps at both ends", () => {
    const timeline = createTimeline(
      samples([
        { t: 0, pos: [0, 0, 0] },
        { t: 50, pos: [0, 0, 0] },
        { t: 50, pos: [0, 0, 0] },
        { t: 100, pos: [0, 0, 0] },
      ]),
    );
    // On a sample.
    expect(stepSampleTime(timeline, 50, 1)).toBe(100);
    expect(stepSampleTime(timeline, 50, -1)).toBe(0);
    // Between samples.
    expect(stepSampleTime(timeline, 70, 1)).toBe(100);
    expect(stepSampleTime(timeline, 70, -1)).toBe(50);
    // At and beyond the ends.
    expect(stepSampleTime(timeline, 0, -1)).toBe(0);
    expect(stepSampleTime(timeline, -20, 1)).toBe(0);
    expect(stepSampleTime(timeline, 0, 1)).toBe(50);
    expect(stepSampleTime(timeline, 100, 1)).toBe(100);
    expect(stepSampleTime(timeline, 100, -1)).toBe(50);
    expect(stepSampleTime(timeline, 900, -1)).toBe(100);
  });
});

describe("lean and melee", () => {
  const LEFT = 2048;
  const RIGHT = 4096;
  const MELEE = 16;
  const IN_AIR = 32768;
  // 50 ms samples standing still at the origin, facing yaw 90 (CoD +Y), with these input masks.
  function held(input: number[], aux: number[] = input.map(() => 0)): ReplaySamples {
    return {
      ...samples(input.map((_, index) => ({ t: index * 50, pos: [0, 0, 0] }))),
      input,
      aux,
    };
  }

  it("ramps leanf like PM_UpdateLean: 350 ms to full, 280 ms back", () => {
    expect(leanStep(0, 175, 1, 0.5)).toBeCloseTo(0.25);
    expect(leanStep(0, 1_000, 1, 0.5)).toBe(0.5);
    expect(leanStep(0, 1_000, -1, 0.25)).toBe(-0.25);
    expect(leanStep(0.5, 140, 0, 0.5)).toBeCloseTo(0.25);
    expect(leanStep(-0.5, 1_000, 0, 0.5)).toBe(0);
    // Going prone while leaning snaps to the prone limit.
    expect(leanStep(0.5, 4, 1, 0.25)).toBe(0.25);
  });

  it("steps leanf from the sample history, so a seek lands on the same value", () => {
    const timeline = createTimeline(
      held([RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, 0, 0]),
    );
    expect(leanAt(timeline, 0)).toBe(0);
    expect(leanAt(timeline, 175)).toBeCloseTo(0.25);
    expect(leanAt(timeline, 360)).toBe(0.5);
    // Released at sample 8 (400 ms): 140 ms later halfway back.
    expect(leanAt(timeline, 540)).toBeCloseTo(0.25);
    expect(leanAt(timeline, 175)).toBeCloseTo(0.25);
  });

  it("ignores the lean keys in the air", () => {
    const timeline = createTimeline(held([LEFT | IN_AIR, LEFT | IN_AIR, LEFT]));
    expect(leanAt(timeline, 100)).toBe(0);
    expect(leanAt(timeline, 135)).toBeCloseTo(-0.05);
  });

  it("moves the eye like AddLeanToPosition with no camera roll", () => {
    const pose = { x: 0, y: 0, z: 60, pitch: 0, yaw: 90 };
    // Full right lean facing +Y: right is +X; fraction 0.75 over 20 units, rolled by 12°.
    const right = addLean(pose, 0.5);
    expect(right.x).toBeCloseTo(15 * Math.cos(Math.PI / 15));
    expect(right.y).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(60 - 15 * Math.sin(Math.PI / 15));
    const left = addLean(pose, -0.5);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.z).toBeCloseTo(right.z);
    expect(addLean(pose, 0)).toBe(pose);
  });

  it("starts a melee swing per press, not while one runs or without a weapon", () => {
    const noWeapon = 3 << 1;
    const input = [0, MELEE, MELEE, 0, MELEE, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, MELEE, 0, MELEE];
    const aux = input.map((_, index) => (index === 18 ? noWeapon : 0));
    const timeline = createTimeline(held(input, aux));
    // Pressed at 50 ms; held, then re-pressed at 200 ms mid-swing (ignored); again at 800 ms.
    expect(timeline.meleeStarts).toEqual([50, 800]);
  });
});

describe("weapon fire and aim down sights", () => {
  const ATTACK = 1;
  const MELEE = 16;
  const FORWARD = 32;
  const ADS = 1024;
  // Frames every `ms` milliseconds standing still, with these input and aux masks.
  function frames(input: number[], ms: number, aux: number[] = input.map(() => 0), stance = 0) {
    return createTimeline({
      ...samples(
        input.map((_, index) => ({ t: index * ms, pos: [0, 0, 0] })),
        [],
        input.map(() => stance),
      ),
      flags: input.map(() => (stance ? 1 : 0)),
      input,
      aux,
    });
  }

  it("fires one semi-auto shot per press, holding fireTime between shots", () => {
    // 10 ms frames. Pressed at 0 and held to 300: fireTime 135 runs out held, so it waits for the
    // release at 300; pressed again at 320.
    const held = frames([...Array<number>(30).fill(ATTACK), 0, 0, ATTACK, ATTACK], 10);
    expect(held.fireStarts).toEqual([0, 320]);
    // Re-pressed at 100, inside fireTime, and held past 135: locked until released at 200.
    const early = frames(
      [ATTACK, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...Array<number>(10).fill(ATTACK), 0, ATTACK],
      10,
    );
    expect(early.fireStarts).toEqual([0, 210]);
    // Released before fireTime ends: the next press fires, unless it is down on the frame where
    // weaponTime runs out (140 ms), which locks it like a hold.
    const tapped = (press: number) =>
      frames([ATTACK, ATTACK, ...Array<number>(press - 2).fill(0), ATTACK], 10).fireStarts;
    expect(tapped(15)).toEqual([0, 150]);
    expect(tapped(14)).toEqual([0]);
  });

  it("does not fire without a weapon out, while raising or meleeing", () => {
    const none = 3 << 1;
    expect(frames([ATTACK], 50, [none]).fireStarts).toEqual([]);
    expect(frames([ATTACK], 50, [2 << 1]).fireStarts).toEqual([]);
    expect(frames([ATTACK], 50, [1]).fireStarts).toEqual([]);
    expect(frames([ATTACK], 50, [8]).fireStarts).toEqual([]);
    // Raised at 50 ms (raiseTime 250): a press at 100 waits; pressed again at 350 it fires.
    const raised = frames([0, 0, ATTACK, 0, 0, 0, 0, ATTACK], 50, [none, 0, 0, 0, 0, 0, 0, 0]);
    expect(raised.fireStarts).toEqual([350]);
    // A melee at 0 holds weaponTime for meleeTime 700.
    const melee = frames([MELEE, 0, ATTACK, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ATTACK], 50);
    expect(melee.fireStarts).toEqual([750]);
  });

  it("moves fWeaponPosFrac 250 ms in and 400 ms out, stepped from the samples", () => {
    // ADS from 0 to 300 ms at 50 ms samples.
    const aimed = frames([ADS, ADS, ADS, ADS, ADS, ADS, 0, 0, 0, 0, 0, 0, 0, 0, 0], 50);
    expect(adsAt(aimed, 0).frac).toBe(0);
    expect(aimed.ads[1]).toBeCloseTo(0.2);
    expect(adsAt(aimed, 125).frac).toBeCloseTo(0.5);
    expect(adsAt(aimed, 250).frac).toBe(1);
    expect(adsAt(aimed, 400).frac).toBeCloseTo(0.75);
    expect(adsAt(aimed, 500).frac).toBeCloseTo(0.5);
    expect(adsAt(aimed, 700).frac).toBe(0);
    // ads_up's weight blends in over 0.5 s and back out.
    expect(adsAt(aimed, 250).up).toBeCloseTo(0.5);
    expect(adsAt(aimed, 400).up).toBeCloseTo(0.4);
  });

  it("allows ADS in the air but not while raising, meleeing or without a weapon", () => {
    const inAir = frames([ADS | 32768, ADS | 32768, ADS | 32768], 50);
    expect(adsAt(inAir, 100).frac).toBeCloseTo(0.4);
    // Raised at 50 ms: aiming waits until raiseTime is over at 300 ms.
    const raised = frames(Array<number>(10).fill(ADS), 50, [6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(adsAt(raised, 300).frac).toBe(0);
    expect(adsAt(raised, 400).frac).toBeCloseTo(0.4);
    const melee = frames([ADS | MELEE, ADS, ADS, ADS], 50);
    expect(adsAt(melee, 150).frac).toBe(0);
    // Losing the weapon drops fWeaponPosFrac to 0 at once (no aimDownSight).
    const holstered = frames([ADS, ADS, ADS, ADS, ADS, ADS, ADS], 50, [0, 0, 0, 0, 0, 0, 6]);
    expect(adsAt(holstered, 290).frac).toBe(1);
    expect(adsAt(holstered, 300).frac).toBe(0);
  });

  it("drops ADS for a prone player holding it while moving, but takes a fresh press", () => {
    const crawling = frames([ADS | FORWARD, ADS | FORWARD, ADS | FORWARD], 50, [0, 0, 0], 2);
    expect(crawling.aim[0]).toBe(1);
    expect(crawling.aim[1]).toBe(0);
  });

  it("records fWeaponPosFrac at each shot", () => {
    // Fully aimed at 250 ms; released at 350, so 100 ms out by the second shot at 450.
    const shots = frames([ADS, ADS, ADS, ADS, ADS, ADS | ATTACK, ADS, 0, 0, ATTACK], 50);
    expect(shots.fireStarts).toEqual([250, 450]);
    expect(shots.fireFrac).toEqual([1, 0.75]);
  });
});

describe("replay markers and clock", () => {
  const markers: ReplayMarker[] = [
    { t: 1_000, kind: "save" },
    { t: 2_000, kind: "checkpoint", cp_id: 3 },
    { t: 3_000, kind: "load" },
  ];

  it("jumps to the next and previous save or load", () => {
    expect(findMarker(markers, 0, 1, ["save", "load"])?.t).toBe(1_000);
    expect(findMarker(markers, 1_000, 1, ["save", "load"])?.t).toBe(3_000);
    expect(findMarker(markers, 3_000, -1, ["save", "load"])?.t).toBe(1_000);
    expect(findMarker(markers, 500, -1, ["save", "load"])).toBeNull();
    expect(markers.map((marker) => marker.t)).toEqual([1_000, 2_000, 3_000]);
  });

  it("formats elapsed time as mm:ss.cc", () => {
    expect(formatReplayClock(0)).toBe("00:00.00");
    expect(formatReplayClock(83_456)).toBe("01:23.45");
    expect(formatReplayClock(3_725_000)).toBe("62:05.00");
    expect(formatReplayClockMs(83_456.4)).toBe("01:23.456");
    expect(formatReplayClockMs(3_725_007)).toBe("62:05.007");
  });
});
