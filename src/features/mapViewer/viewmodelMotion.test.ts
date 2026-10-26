import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { WeaponMotion } from "./codSpace";
import { viewmodelMotion } from "./viewmodelMotion";

function motionAt(motion: WeaponMotion | undefined) {
  const position = new Vector3(1, 2, 3);
  const quaternion = new Quaternion(0.5, 0.5, 0.5, 0.5);
  viewmodelMotion(motion, position, quaternion);
  return { position, quaternion };
}

describe("viewmodel motion", () => {
  it("rests at the rest pose without motion or lean", () => {
    for (const { position, quaternion } of [motionAt(undefined), motionAt({ lean: 0 })]) {
      expect(position.length()).toBe(0);
      expect(quaternion.equals(new Quaternion())).toBe(true);
    }
  });

  it("shifts toward the lean side and rolls the gun -2° per lean fraction", () => {
    // Full right lean: fraction 0.75, 1.2 units right (GLB +z), rolled -1.5° about forward.
    const right = motionAt({ lean: 0.5 });
    expect(right.position.z).toBeCloseTo(1.2 * 0.0254 * Math.cos((1.5 * Math.PI) / 180));
    const roll = new Vector3(0, 1, 0).applyQuaternion(right.quaternion);
    expect(Math.atan2(roll.z, roll.y)).toBeCloseTo((-1.5 * Math.PI) / 180);
    expect(motionAt({ lean: -0.5 }).position.z).toBeCloseTo(-right.position.z);
  });

  it("scales the lean shift by 1 - fWeaponPosFrac but keeps the roll", () => {
    const hip = motionAt({ lean: 0.5 });
    const half = motionAt({ lean: 0.5, ads: 0.5 });
    expect(half.position.z).toBeCloseTo(hip.position.z / 2);
    const aimed = motionAt({ lean: 0.5, ads: 1 });
    expect(aimed.position.length()).toBeCloseTo(0);
    expect(aimed.quaternion.equals(hip.quaternion)).toBe(true);
  });

  it("moves the gun along the view axes and turns it by CoD angles", () => {
    const { position, quaternion } = motionAt({ lean: 0, offset: [1, 2, 3], angles: [0, 10, 0] });
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
    const pitched = motionAt({ lean: 0, angles: [10, 0, 0] }).quaternion;
    expect(new Vector3(1, 0, 0).applyQuaternion(pitched).y).toBeCloseTo(-Math.sin(Math.PI / 18));
  });
});
