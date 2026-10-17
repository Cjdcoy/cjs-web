import { Euler, Quaternion, Vector3 } from "three";
import { leanFraction, METRES_PER_COD_UNIT, type WeaponMotion } from "./codSpace";

/**
 * viewmodel_luger_melee1 (luger_mp2's meleeAnim, 21 frames at 24 fps) as a rigid swing of the whole
 * viewmodel about the right shoulder (j_shoulder_ri), turned so the arm keeps pointing at the gun's
 * animated tag_weapon: [xanim ms, x, y, z (metres), qx, qy, qz, qw] in the GLB's frame, so a model
 * vertex v moves to q·v + xyz. Derived offline from the xanim with the same DObjCalcSkel pose as the
 * GLB export (scratchpad meleecurve/curve.go, MODE=arm GUN=viewmodel_luger IDLE=viewmodel_luger_idle
 * ADS=viewmodel_luger_ads_up). ponytail: rigid, so the elbow, wrist and left hand do not bend; exact
 * needs a skinned GLB with the xanim as a glTF clip.
 */
const MELEE_KEYS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 1],
  [42, -0.0038, 0.0183, 0.0041, -0.0028, -0.0106, 0.044, 0.999],
  [83, -0.0162, 0.0536, 0.012, -0.0086, -0.0322, 0.1318, 0.9907],
  [125, -0.0408, 0.094, 0.0202, -0.0156, -0.0583, 0.2403, 0.9688],
  [167, -0.0593, 0.1144, 0.0232, -0.0194, -0.0713, 0.3015, 0.9506],
  [208, -0.0643, 0.1192, 0.0242, -0.0204, -0.0753, 0.3168, 0.9453],
  [250, -0.0659, 0.121, 0.025, -0.0209, -0.078, 0.3223, 0.9432],
  [292, -0.0552, 0.1041, 0.0129, -0.0156, -0.042, 0.2734, 0.9609],
  [333, -0.0398, 0.0542, -0.0219, -0.0009, 0.0544, 0.1364, 0.9892],
  [375, -0.0463, -0.0063, -0.0605, 0.0156, 0.1587, -0.0285, 0.9868],
  [417, -0.0624, -0.0426, -0.0811, 0.0254, 0.2163, -0.1332, 0.9669],
  [458, -0.0679, -0.0524, -0.0858, 0.0279, 0.2301, -0.1624, 0.9591],
  [500, -0.055, -0.0522, -0.076, 0.0247, 0.1986, -0.1542, 0.9676],
  [542, -0.0325, -0.0509, -0.0555, 0.0185, 0.1388, -0.1383, 0.9804],
  [583, -0.0167, -0.0458, -0.0373, 0.0133, 0.0908, -0.1176, 0.9888],
  [625, -0.0096, -0.0398, -0.0273, 0.0102, 0.0658, -0.0996, 0.9928],
  [667, -0.0043, -0.0337, -0.0185, 0.0076, 0.0444, -0.0828, 0.9956],
  [708, -0.0005, -0.0273, -0.0112, 0.0053, 0.0269, -0.0659, 0.9974],
  [750, 0.0016, -0.0199, -0.0056, 0.0033, 0.0136, -0.0476, 0.9988],
  [792, 0.0027, -0.011, -0.0004, 0.0012, 0.0013, -0.0258, 0.9997],
  [833, 0, 0, 0, 0, 0, 0, 1],
];

/**
 * viewmodel_luger_pullout (luger_mp2's raiseAnim; iw_13.iwd xanim/viewmodel_luger_pullout, 14 frames
 * at 24 fps) as the rigid motion of the gun's tag_weapon from the idle pose, in the MELEE_KEYS
 * format. Generated like MELEE_KEYS (scratchpad meleecurve/curve.go, GUN=viewmodel_luger
 * IDLE=viewmodel_luger_idle ADS=viewmodel_luger_ads_up, tag_weapon mode). ponytail: the hands move
 * rigidly with the gun.
 */
const RAISE_KEYS: readonly (readonly number[])[] = [
  [0, -0.0482, -0.5387, 0.1005, 0.1826, 0.0901, 0.4099, 0.8891],
  [42, -0.0488, -0.5176, 0.0988, 0.1801, 0.0873, 0.4042, 0.8925],
  [83, -0.0505, -0.4622, 0.094, 0.1732, 0.0799, 0.3879, 0.9018],
  [125, -0.0525, -0.3847, 0.0868, 0.1622, 0.0692, 0.3625, 0.9152],
  [167, -0.0538, -0.2974, 0.078, 0.1476, 0.0566, 0.3294, 0.9309],
  [208, -0.0538, -0.2124, 0.0683, 0.1298, 0.0435, 0.2901, 0.9471],
  [250, -0.052, -0.1421, 0.0583, 0.1097, 0.0312, 0.2464, 0.9624],
  [292, -0.0481, -0.099, 0.0488, 0.0882, 0.0206, 0.2004, 0.9755],
  [333, -0.0421, -0.0743, 0.0388, 0.0665, 0.0122, 0.1541, 0.9857],
  [375, -0.0341, -0.0516, 0.0277, 0.0458, 0.0063, 0.1098, 0.9929],
  [417, -0.025, -0.0323, 0.0175, 0.0275, 0.0027, 0.07, 0.9972],
  [458, -0.0159, -0.0175, 0.0086, 0.013, 0.0008, 0.0369, 0.9992],
  [500, -0.0072, -0.0063, 0.0023, 0.0034, 0.0001, 0.0129, 0.9999],
  [542, 0, 0, 0, 0, 0, 0, 1],
];

/**
 * CG_RegisterWeapon (CoD2 1.3 mac:353344-353375) plays anim 12 (raiseAnim) at
 * XAnimGetLengthMsec / raiseTime: 13 frame steps (xanim_load_obj.cpp:259 numframes - 1) at 24 fps is
 * 541 ms, squeezed into luger_mp2's raiseTime 0.25 s.
 */
const RAISE_ANIM_MS = 541;
const RAISE_TIME_MS = 250;

/**
 * The same code plays anim 7 (meleeAnim) at XAnimGetLengthMsec / meleeTime (weaponDef +532): 20 frame
 * steps at 24 fps is 833 ms, squeezed into luger_mp2's meleeTime 0.7 s. PM_Weapon (mac:148994-149017)
 * starts it with the press (event 163, weaponTime = meleeTime); meleeDelay (0.1 s) only defers the
 * hit, so it does not shift the anim.
 */
const MELEE_ANIM_MS = 833;
const MELEE_TIME_MS = 700;

const from = new Quaternion();
const to = new Quaternion();
const gun = new Quaternion();
const euler = new Euler();
const next = new Vector3();
const DEGREES = Math.PI / 180;

/** Poses the model at `ms` into an xanim key table; false outside it (the idle pose). */
function samplePose(
  keys: readonly (readonly number[])[],
  ms: number | null | undefined,
  position: Vector3,
  quaternion: Quaternion,
): boolean {
  if (ms === null || ms === undefined || ms < 0 || ms >= keys[keys.length - 1][0]) return false;
  let index = 0;
  while (keys[index + 1][0] <= ms) index += 1;
  const a = keys[index];
  const b = keys[index + 1];
  const s = (ms - a[0]) / (b[0] - a[0]);
  position.set(a[1], a[2], a[3]).lerp(next.set(b[1], b[2], b[3]), s);
  quaternion.slerpQuaternions(from.set(a[4], a[5], a[6], a[7]), to.set(b[4], b[5], b[6], b[7]), s);
  return true;
}

/**
 * Sets the viewmodel's offset from its idle pose (GLB frame: x forward, y up, z right) for a frame,
 * as CG_AddViewWeapon places it (CoD2 1.3 mac:352598-353010): the xanim pose (raise, else melee),
 * turned by BG_CalculateWeaponAngles' angles (the frame's angles plus the lean roll of -2 × the lean
 * fraction), then moved by the frame's offset plus the lean shift of 1.6 × the fraction along the
 * right vector of that roll. Hip only (ADS is not recorded as a fraction).
 */
export function viewmodelMotion(
  motion: WeaponMotion | undefined,
  position: Vector3,
  quaternion: Quaternion,
): void {
  position.set(0, 0, 0);
  quaternion.identity();
  if (!motion) return;
  const raiseMs = motion.raiseMs == null ? null : (motion.raiseMs * RAISE_ANIM_MS) / RAISE_TIME_MS;
  if (!samplePose(RAISE_KEYS, raiseMs, position, quaternion)) {
    const meleeMs =
      motion.meleeMs == null ? null : (motion.meleeMs * MELEE_ANIM_MS) / MELEE_TIME_MS;
    samplePose(MELEE_KEYS, meleeMs, position, quaternion);
  }
  const [pitch, yaw, roll] = motion.angles ?? [0, 0, 0];
  const fraction = leanFraction(motion.lean);
  const leanRoll = -2 * fraction;
  // AnglesToAxis is yaw about up, pitch (down) about left, roll about forward; GLB is (x, z, -y)
  // of CoD, so that is Ry(yaw)·Rz(-pitch)·Rx(roll).
  gun.setFromEuler(euler.set((roll + leanRoll) * DEGREES, yaw * DEGREES, -pitch * DEGREES, "YZX"));
  position.applyQuaternion(gun);
  quaternion.premultiply(gun);
  // Offset along the view's (forward, left, up); the lean shift is CoD right of (0, 0, leanRoll),
  // (0, -cos r, -sin r), scaled by 1.6 × the fraction.
  const [forward, left, up] = motion.offset ?? [0, 0, 0];
  const r = leanRoll * DEGREES;
  const shift = 1.6 * fraction;
  position.add(
    next
      .set(forward, up - Math.sin(r) * shift, -left + Math.cos(r) * shift)
      .multiplyScalar(METRES_PER_COD_UNIT),
  );
}
