import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { viewmodelMotion } from "./viewmodelMotion";

function motionAt(lean: number, meleeMs: number | null) {
  const position = new Vector3(1, 2, 3);
  const quaternion = new Quaternion(0.5, 0.5, 0.5, 0.5);
  viewmodelMotion({ lean, meleeMs }, position, quaternion);
  return { position, quaternion };
}

describe("viewmodel motion", () => {
  it("rests at the idle pose without a swing or lean", () => {
    for (const { position, quaternion } of [
      motionAt(0, null),
      motionAt(0, 700),
      motionAt(0, 5_000),
    ]) {
      expect(position.length()).toBe(0);
      expect(quaternion.equals(new Quaternion())).toBe(true);
    }
  });

  it("plays viewmodel_luger_melee1's 833 ms xanim over luger_mp2's 700 ms meleeTime", () => {
    const at = (xanimMs: number) => motionAt(0, (xanimMs * 700) / 833);
    // Generator keys (curve.go MODE=arm, viewmodel_luger) at 250 and 375 ms.
    expect(at(250).position.toArray()).toEqual([
      expect.closeTo(-0.0659),
      expect.closeTo(0.121),
      expect.closeTo(0.025),
    ]);
    expect(at(250).quaternion.w).toBeCloseTo(0.9432);
    expect(at(375).position.toArray()).toEqual([
      expect.closeTo(-0.0463),
      expect.closeTo(-0.0063),
      expect.closeTo(-0.0605),
    ]);
    expect(at(375).quaternion.y).toBeCloseTo(0.1587);
    // Halfway between the 0 and 42 ms keys.
    expect(at(21).position.y).toBeCloseTo(0.0183 / 2);
    // Still swinging just before 700 ms, idle from 700 ms.
    expect(motionAt(0, 699).quaternion.w).toBeLessThan(1);
    expect(motionAt(0, 700).position.length()).toBe(0);
  });

  it("shifts toward the lean side and rolls the gun -2° per lean fraction", () => {
    // Full right lean: fraction 0.75, 1.2 units right (GLB +z), rolled -1.5° about forward.
    const right = motionAt(0.5, null);
    expect(right.position.z).toBeCloseTo(1.2 * 0.0254 * Math.cos((1.5 * Math.PI) / 180));
    const roll = new Vector3(0, 1, 0).applyQuaternion(right.quaternion);
    expect(Math.atan2(roll.z, roll.y)).toBeCloseTo((-1.5 * Math.PI) / 180);
    expect(motionAt(-0.5, null).position.z).toBeCloseTo(-right.position.z);
  });

  it("plays the pullout over raiseTime and takes it over a melee", () => {
    const pose = (raiseMs: number | null) => {
      const position = new Vector3();
      viewmodelMotion({ lean: 0, meleeMs: 250, raiseMs }, position, new Quaternion());
      return position;
    };
    expect(pose(0).y).toBeCloseTo(-0.5387);
    // 125 ms of the 250 ms raise is 270.5 ms into the 541 ms xanim.
    expect(pose(125).y).toBeCloseTo(-0.1421 + ((-0.099 + 0.1421) * 20.5) / 42, 3);
    expect(pose(260).x).toBeCloseTo(motionAt(0, 250).position.x);
  });

  it("moves the gun along the view axes and turns it by CoD angles", () => {
    const position = new Vector3();
    const quaternion = new Quaternion();
    viewmodelMotion(
      { lean: 0, meleeMs: null, offset: [1, 2, 3], angles: [0, 10, 0] },
      position,
      quaternion,
    );
    // Forward, left and up are GLB +x, -z and +y.
    expect(position.toArray().map((value) => value / 0.0254)).toEqual([
      expect.closeTo(1),
      expect.closeTo(3),
      expect.closeTo(-2),
    ]);
    // Yaw 10° turns the muzzle left (toward -z).
    const forward = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    expect(Math.atan2(-forward.z, forward.x)).toBeCloseTo((10 * Math.PI) / 180);
    // Pitch 10° (down) turns it toward -y.
    viewmodelMotion({ lean: 0, meleeMs: null, angles: [10, 0, 0] }, position, quaternion);
    expect(new Vector3(1, 0, 0).applyQuaternion(quaternion).y).toBeCloseTo(-Math.sin(Math.PI / 18));
  });
});
