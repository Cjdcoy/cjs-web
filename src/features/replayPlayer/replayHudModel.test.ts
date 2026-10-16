import { describe, expect, it } from "vitest";
import type { ReplayMarker, ReplaySamples, ReplaySkip } from "../../lib/api";
import {
  angleHelper,
  angleHelperAt,
  angleHelperZone,
  findAutoSkip,
  fpsAt,
  jumpTimerAt,
  keysAt,
  positionHudLines,
  recordSkip,
  weaponHolstered,
  REPLAY_KEYS,
  skippedFails,
  skippedLoadCount,
  speedAt,
  type AngleHelperState,
} from "./replayHudModel";

const airborne = { onGround: false, velX: 400, velY: 0, yaw: 0, fps: 125 };

function samples(overrides: Partial<ReplaySamples> = {}): ReplaySamples {
  return {
    run_id: 1,
    mapname: "jm_test",
    player_id: 2,
    playername: "Runner",
    format_version: 11,
    tick_ms: 50,
    duration_ms: 100,
    finished: true,
    t: [0, 50, 100],
    pos: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ang: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    vel: [300, 400, 0, 600, 0, 50, 600, 0, 0],
    stance: [0, 0, 0],
    markers: [],
    ...overrides,
  };
}

/** The mod's HUD rounding of the float edges: int() positions and bar sizes clamped to 2..90. */
function modHud(state: AngleHelperState) {
  const size = (value: number) => Math.min(90, Math.max(2, Math.trunc(Math.abs(value))));
  return {
    leftX: Math.trunc(state.deadzoneLeft),
    rightX: Math.trunc(state.deadzoneRight),
    leftBarX: Math.trunc((state.gainLimitLeft + state.deadzoneLeft) / 2),
    rightBarX: Math.trunc((state.deadzoneRight + state.gainLimitRight) / 2),
    leftSize: size(state.deadzoneLeft - state.gainLimitLeft),
    rightSize: size(state.gainLimitRight - state.deadzoneRight),
  };
}

describe("angle helper (anglehelper_apply)", () => {
  it("hides on the ground and collapses to the centre without input or below 100 u/s", () => {
    expect(angleHelper({ ...airborne, onGround: true, strafe: 1, forward: 1 }).display).toBe(0);
    expect(angleHelper({ ...airborne, strafe: 0, forward: 0 }).display).toBe(1);
    expect(angleHelper({ ...airborne, velX: 100, strafe: 1, forward: 1 }).display).toBe(1);
    // (g_speed − g_speed/fps) / speed ≥ 1: too slow for an optimal angle.
    expect(angleHelper({ ...airborne, velX: 150, strafe: 1, forward: 1 }).display).toBe(1);
  });

  it("keeps float edges, which round to the mod's HUD values", () => {
    // 190 u/s at 125 fps: dopt = acos(188.48 / 400) ≈ 61.89°, wish 45° off the velocity.
    const right = angleHelper({ ...airborne, strafe: 1, forward: 1 });
    expect(right.deadzoneLeft).toBeCloseTo(-106.888, 3);
    expect(right.deadzoneRight).toBeCloseTo(16.888, 3);
    expect(modHud(right)).toEqual({
      leftX: -106,
      rightX: 16,
      leftBarX: -120,
      rightBarX: 30,
      leftSize: 28,
      rightSize: 28,
    });
    const left = angleHelper({ ...airborne, strafe: -1, forward: 1 });
    expect(modHud(left)).toMatchObject({ leftX: -16, rightX: 106, leftBarX: -30, rightBarX: 120 });
  });

  // Mid-air states from run 28591 (250 fps), with the values a literal GSC port gives.
  it.each([
    [32930, [55, 323], 90.34, { leftX: 0, rightX: 109, leftBarX: -17, rightBarX: 127 }],
    [32930, [-310, 93], 174.08, { leftX: 1, rightX: 109, leftBarX: -16, rightBarX: 127 }],
    [33058, [-143, 290], 105.84, { leftX: -109, rightX: -1, leftBarX: -127, rightBarX: 16 }],
  ] as const)("matches the mod for input %i", (mask, [velX, velY], yaw, expected) => {
    const replay = samples({ flags: [4, 4, 4], input: [mask, mask, mask] });
    const state = angleHelperAt(replay, 1, 250, { velX, velY, yaw });
    expect(state && modHud(state)).toEqual({ ...expected, leftSize: 35, rightSize: 35 });
  });

  it("reads on-ground from flags bit 4 and moves from the input mask", () => {
    const replay = samples({ flags: [0, 4, 4], input: [32 | 256, 32 | 256, 0] });
    const motion = { velX: 400, velY: 0, yaw: 0 };
    expect(angleHelperAt(replay, 0, 125, motion)?.display).toBe(0);
    expect(angleHelperAt(replay, 1, 125, motion)?.deadzoneLeft).toBeCloseTo(-106.888, 3);
    expect(angleHelperAt(replay, 2, 125, motion)?.display).toBe(1);
    expect(angleHelperAt(samples(), 1, 125, motion)).toBeNull();
  });

  it("classifies the view as gaining, in the deadzone, or losing speed", () => {
    const edges = { display: 2 as const, gainLimitLeft: -120, gainLimitRight: 60 };
    expect(angleHelperZone({ ...edges, deadzoneLeft: -10, deadzoneRight: 30 })).toBe("deadzone");
    expect(angleHelperZone({ ...edges, deadzoneLeft: 5, deadzoneRight: 40 })).toBe("gain");
    expect(angleHelperZone({ ...edges, deadzoneLeft: -40, deadzoneRight: -5 })).toBe("gain");
    expect(
      angleHelperZone({ ...edges, gainLimitLeft: 2, deadzoneLeft: 20, deadzoneRight: 50 }),
    ).toBe("loss");
    expect(
      angleHelperZone({
        ...edges,
        gainLimitRight: -1,
        deadzoneLeft: -50,
        deadzoneRight: -20,
      }),
    ).toBe("loss");
  });
});

describe("speed meter and FPS", () => {
  it("shows int(length2d(vel)) and compares with the previous sample", () => {
    const replay = samples({ vel: [300, 400, 0, 600, 0, 50, 600, 0, 0] });
    expect(speedAt(replay, 0)).toEqual({ value: 500, trend: "same" });
    expect(speedAt(replay, 1)).toEqual({ value: 600, trend: "up" });
    expect(speedAt(samples({ vel: [600, 0, 0, 599.9, 0, 0, 0, 0, 0] }), 1)).toEqual({
      value: 599,
      trend: "down",
    });
  });

  it("uses the latest fps marker, falls back to the run FPS, and hides when unknown", () => {
    const markers: ReplayMarker[] = [
      { t: 0, kind: "fps", fps: 250 },
      { t: 40, kind: "save" },
      { t: 50, kind: "fps", fps: 333 },
      { t: 80, kind: "fps" },
    ];
    expect(fpsAt(samples({ markers, run_fps: 125 }), 10)).toBe(250);
    expect(fpsAt(samples({ markers, run_fps: 125 }), 60)).toBe(333);
    expect(fpsAt(samples({ markers, run_fps: 125 }), 90)).toBe(125);
    expect(fpsAt(samples({ run_fps: 0 }), 90)).toBeNull();
    expect(fpsAt(samples(), 90)).toBeNull();
  });
});

describe("position HUD and jump timer", () => {
  it("prints the feet origin and angles truncated toward zero to two decimals", () => {
    expect(
      positionHudLines({ x: 1234.5678, y: -0.059, z: 0.29, pitch: -12.345, yaw: 179.999 }),
    ).toEqual(["1234.56 -0.05 0.29", "-12.34 179.99 0.00"]);
    // The mod's splicing would print "5" for 0.05 and "-.5" for -0.005; these stay readable.
    expect(positionHudLines({ x: 0.05, y: -0.005, z: 0, pitch: 0, yaw: 0 })[0]).toBe(
      "0.05 0.00 0.00",
    );
  });

  it("times the current airborne stretch from playback time, truncated to 0.1 s", () => {
    const run = samples({
      t: [0, 100, 200, 300, 400, 500],
      flags: [0, 4, 4, 4, 0, 4],
      pos: Array(18).fill(0),
      ang: Array(18).fill(0),
      vel: Array(18).fill(0),
      stance: Array(6).fill(0),
    });
    expect(jumpTimerAt(run, 0, 50)).toBe(0);
    expect(jumpTimerAt(run, 1, 199)).toBe(0); // 99 ms
    // Seeking straight to 390 ms finds the stretch that began at 100 ms.
    expect(jumpTimerAt(run, 3, 390)).toBe(0.2);
    expect(jumpTimerAt(run, 4, 400)).toBe(0);
    expect(jumpTimerAt(run, 5, 1_750)).toBe(1.2);
    expect(jumpTimerAt(samples(), 1, 50)).toBeNull();
  });
});

describe("key display", () => {
  it("maps the recorded input bits to W A S D C Space Ctrl", () => {
    const replay = samples({ input: [32 | 128 | 2, 64 | 256 | 8192, 16384 | 32768] });
    expect(keysAt(replay, 0)).toEqual([true, true, false, false, false, true, false]);
    expect(keysAt(replay, 1)).toEqual([false, false, true, true, true, false, false]);
    // 32768 is "not on ground", not a key.
    expect(keysAt(replay, 2)).toEqual([false, false, false, false, false, false, true]);
    expect(keysAt(samples(), 0)).toBeNull();
  });

  it("lays Space exactly under A–D with C and Ctrl as standard cells beside it", () => {
    const cells = Object.fromEntries(REPLAY_KEYS.map((entry) => [entry.id, entry]));
    const edges = (id: string) => [
      cells[id].x - cells[id].width / 2,
      cells[id].x + cells[id].width / 2,
    ];
    const key = (id: string) => cells[id];
    expect(edges("jump")).toEqual([edges("left")[0], edges("right")[1]]);
    expect([key("crouch").width, key("prone").width]).toEqual([20, 20]);
    // The same 2-unit gap as between A, S and D.
    expect(edges("jump")[0] - edges("crouch")[1]).toBe(edges("back")[0] - edges("left")[1]);
    expect(edges("prone")[0] - edges("jump")[1]).toBe(2);
  });
});

describe("weapon state", () => {
  it("hides the weapon only while the aux weapon state is 3 (no active weapon)", () => {
    // 0 primary, 2 primaryb, 5 offhand on a ladder, 6 none, 7 none on a ladder (run 28591's climbs).
    const replay = samples({ aux: [0, 2, 5, 6, 7] });
    expect([0, 1, 2, 3, 4].map((index) => weaponHolstered(replay, index))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(weaponHolstered(samples(), 0)).toBe(false);
  });
});

describe("auto-skip", () => {
  const skips: ReplaySkip[] = [
    { start_t: 1_000, target_t: 3_000, fails: 2 },
    { start_t: 5_000, target_t: 6_000, fails: 1 },
  ];
  const loads: ReplayMarker[] = [
    { t: 1_500, kind: "load" },
    { t: 2_000, kind: "save" },
    { t: 3_000, kind: "load" },
    { t: 6_000, kind: "load" },
  ];

  it("fires inside a window unless the viewer seeked into it", () => {
    expect(findAutoSkip(skips, 999, null)).toBeNull();
    expect(findAutoSkip(skips, 1_000, null)).toBe(skips[0]);
    expect(findAutoSkip(skips, 2_999, 400)).toBe(skips[0]);
    expect(findAutoSkip(skips, 3_000, null)).toBeNull();
    expect(findAutoSkip(skips, 2_500, 2_000)).toBeNull();
    expect(findAutoSkip(skips, 1_200, 1_000)).toBe(skips[0]);
    expect(findAutoSkip(skips, 5_100, 2_000)).toBe(skips[1]);
  });

  it("counts the loads jumped over from the firing time, not the plan's count", () => {
    expect(skippedLoadCount(loads, 1_000, 3_000)).toBe(2);
    expect(skippedLoadCount(loads, 1_600, 3_000)).toBe(1);
  });

  it("sums executed skips up to now, keeping the highest count per target", () => {
    let executed = recordSkip(new Map(), 3_000, 1);
    executed = recordSkip(executed, 3_000, 2);
    executed = recordSkip(executed, 3_000, 1);
    executed = recordSkip(executed, 6_000, 1);
    expect(skippedFails(executed, 6_000)).toBe(3);
    // Rewinding before a target removes its fails from the display.
    expect(skippedFails(executed, 4_000)).toBe(2);
    expect(skippedFails(executed, 2_000)).toBe(0);
  });
});
