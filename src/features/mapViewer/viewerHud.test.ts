import { describe, expect, it } from "vitest";
import { codToScenePosition, codToSceneRotation, sceneToCodPose } from "./codSpace";
import { cameraReadout, flySpeedAfterWheel, hipReticle } from "./viewerHud";

describe("hip reticle", () => {
  it("places luger_mp2's side ticks at the 1° minimum spread on the 480-tall virtual screen", () => {
    // tan(1°) · 240 / tan(32.5°) = 6.58 virtual units; ticks are 5 of 8 texels of a 6-unit quad.
    expect(hipReticle(480)).toEqual({ offset: 7, width: 1, length: 4, outline: 1, nudge: 0.5 });
    // The in-game screenshot's 1129 px tall view: 15 px gap, 2 px wide, 9 px long ticks.
    expect(hipReticle(1129)).toEqual({ offset: 15, width: 2, length: 9, outline: 1, nudge: 0 });
    expect(hipReticle(2160).width).toBe(3);
  });

  it("keeps whole-pixel minimums on small views", () => {
    expect(hipReticle(200)).toEqual({ offset: 3, width: 1, length: 3, outline: 1, nudge: 0.5 });
  });
});

describe("free camera readout", () => {
  it("round-trips a CoD pose through scene space", () => {
    const [rx, ry] = codToSceneRotation(-12.5, 170);
    const pose = sceneToCodPose(codToScenePosition(2766.84, 343.81, -1135.87), [rx, ry]);
    expect(pose.x).toBeCloseTo(2766.84);
    expect(pose.y).toBeCloseTo(343.81);
    expect(pose.z).toBeCloseTo(-1135.87);
    expect(pose.pitch).toBeCloseTo(-12.5);
    expect(pose.yaw).toBeCloseTo(170);
    // Yaw wraps into [-180, 180) like the game's angles.
    expect(
      sceneToCodPose([0, 0, 0], codToSceneRotation(0, 270).slice(0, 2) as [number, number]).yaw,
    ).toBeCloseTo(-90);
  });

  it("prints position, angles and speeds to two decimals without negative zero", () => {
    expect(
      cameraReadout({ x: 2766.844, y: -0.001, z: -1135.87, pitch: 41.594, yaw: -41.6 }, 0, 400),
    ).toBe("2766.84 0.00 -1135.87\n41.59 -41.60 0.00\n0 u/s (fly speed 400)");
  });
});

describe("wheel fly speed", () => {
  it("steps a mouse notch by 1.25 and keeps trackpad deltas proportional", () => {
    expect(flySpeedAfterWheel(400, -100, 0)).toBeCloseTo(500);
    expect(flySpeedAfterWheel(400, 100, 0)).toBeCloseTo(320);
    // Ten 10 px trackpad events add up to one notch.
    let speed = 400;
    for (let index = 0; index < 10; index += 1) speed = flySpeedAfterWheel(speed, -10, 0);
    expect(speed).toBeCloseTo(500);
  });

  it("normalises line and page deltas, caps one event and clamps the speed", () => {
    expect(flySpeedAfterWheel(400, -3, 1)).toBeCloseTo(400 * 1.25 ** 0.48);
    expect(flySpeedAfterWheel(400, -1, 2)).toBeCloseTo(400 * 1.25 ** 2);
    expect(flySpeedAfterWheel(19_000, -100, 0)).toBe(20_000);
    expect(flySpeedAfterWheel(11, 100, 0)).toBe(10);
  });
});
