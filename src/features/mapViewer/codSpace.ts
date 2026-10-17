/** Vertical field of view of the 3D view, close to CoD2's default cg_fov 80 at 4:3 (64.4°). */
export const VIEW_FIELD_OF_VIEW = 65;

/** Metres per CoD unit (one inch). glTF map models are Y-up metres: (x, y, z)cod → (x, z, -y)·INCH. */
export const METRES_PER_COD_UNIT = 0.0254;

/** A viewpoint in CoD space: eye position in CoD units (Z up), angles in degrees (positive pitch looks down). */
export interface CodPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
}

/** One frame from a viewer driver. `follow` locks the camera to the pose; otherwise it is drawn as a marker. */
export interface ViewerFrame {
  pose: CodPose;
  follow: boolean;
  /** First-person weapon state; the weapon rests at its idle pose without it. */
  weapon?: WeaponMotion;
}

export interface WeaponMotion {
  /** CoD2 playerState leanf: -0.5 (full left) to 0.5 (full right), ±0.25 prone. */
  lean: number;
  /** Milliseconds since the current melee swing started, or null. */
  meleeMs: number | null;
  /** Milliseconds since the weapon raise (pullout) started, or null. */
  raiseMs?: number | null;
  /** Gun offset from the eye along the view's forward, left and up axes, CoD units. */
  offset?: readonly [number, number, number];
  /** Gun pitch (down), yaw (left) and roll relative to the view, degrees, before the lean roll. */
  angles?: readonly [number, number, number];
}

/** GetLeanFraction (q_shared): eases leanf, (2 - |f|) * f. */
export function leanFraction(leanf: number): number {
  return (2 - Math.abs(leanf)) * leanf;
}

/** Parses the shareable `#x,y,z,yaw,pitch` camera hash used by the map converter viewer. */
export function parseCameraHash(hash: string): CodPose | null {
  const parts = hash.replace(/^#/, "").split(",");
  if (parts.length < 3 || parts.length > 5) return null;
  const values = parts.map((part) => (part.trim() === "" ? Number.NaN : Number(part)));
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [x, y, z, yaw = 0, pitch = 0] = values;
  return { x, y, z, yaw, pitch };
}

/** three.js camera position (metres, Y up) for a CoD point. */
export function codToScenePosition(x: number, y: number, z: number): [number, number, number] {
  return [x * METRES_PER_COD_UNIT, z * METRES_PER_COD_UNIT, -y * METRES_PER_COD_UNIT];
}

/**
 * three.js camera Euler angles (radians, "YXZ" order) for CoD pitch/yaw. The camera looks down -Z,
 * so CoD yaw 0 (+X) is a -90° turn about Y, and positive CoD pitch (down) is a negative X rotation.
 */
export function codToSceneRotation(pitch: number, yaw: number): [number, number, number] {
  const radians = Math.PI / 180;
  return [-pitch * radians, (yaw - 90) * radians, 0];
}

/** The CoD pose of a three.js camera: the inverse of codToScenePosition and codToSceneRotation, yaw in [-180, 180). */
export function sceneToCodPose(
  [x, y, z]: readonly [number, number, number],
  [rx, ry]: readonly [number, number],
): CodPose {
  const degrees = 180 / Math.PI;
  return {
    x: x / METRES_PER_COD_UNIT,
    y: -z / METRES_PER_COD_UNIT,
    z: y / METRES_PER_COD_UNIT,
    pitch: -rx * degrees,
    yaw: ((((ry * degrees + 90 + 180) % 360) + 360) % 360) - 180,
  };
}
