import { Euler, type Quaternion, type Vector3 } from "three";
import { leanFraction, METRES_PER_COD_UNIT, type WeaponMotion } from "./codSpace";

const euler = new Euler();
const DEGREES = Math.PI / 180;

/**
 * Sets the viewmodel's offset from its rest pose (GLB frame: x forward, y up, z right) for a frame,
 * as CG_AddViewWeapon places it (CoD2 1.3 mac:352598-353010): turned by BG_CalculateWeaponAngles'
 * angles (the frame's angles plus the lean roll of -2 × the lean fraction), then moved by the
 * frame's offset plus the lean shift of 1.6 × the fraction × (1 - fWeaponPosFrac) along the right
 * vector of that roll (mac:352791-352799). The xanims pose the model itself (the frame's anims).
 */
export function viewmodelMotion(
  motion: WeaponMotion | undefined,
  position: Vector3,
  quaternion: Quaternion,
): void {
  if (!motion) {
    position.set(0, 0, 0);
    quaternion.identity();
    return;
  }
  const [pitch, yaw, roll] = motion.angles ?? [0, 0, 0];
  const fraction = leanFraction(motion.lean);
  const leanRoll = -2 * fraction;
  // AnglesToAxis is yaw about up, pitch (down) about left, roll about forward; GLB is (x, z, -y)
  // of CoD, so that is Ry(yaw)·Rz(-pitch)·Rx(roll).
  quaternion.setFromEuler(
    euler.set((roll + leanRoll) * DEGREES, yaw * DEGREES, -pitch * DEGREES, "YZX"),
  );
  // Offset along the view's (forward, left, up); the lean shift is CoD right of (0, 0, leanRoll),
  // (0, -cos r, -sin r), scaled by 1.6 × the fraction.
  const [forward, left, up] = motion.offset ?? [0, 0, 0];
  const r = leanRoll * DEGREES;
  const lean = 1.6 * fraction * (1 - (motion.ads ?? 0));
  position
    .set(forward, up - Math.sin(r) * lean, -left + Math.cos(r) * lean)
    .multiplyScalar(METRES_PER_COD_UNIT);
}
