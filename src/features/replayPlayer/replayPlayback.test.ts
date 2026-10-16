import { describe, expect, it } from "vitest";
import type { ReplayMarker, ReplaySamples } from "../../lib/api";
import {
  createTimeline,
  effectiveStance,
  eyeHeight,
  findMarker,
  findSampleIndex,
  formatReplayClock,
  hermite,
  lerpAngle,
  pathSegments,
  sampleMotion,
  samplePose,
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
  });
});
