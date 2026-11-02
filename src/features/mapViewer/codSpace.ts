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
  /** Third-person body, drawn instead of the marker while the camera is detached. */
  body?: BodyPose;
}

/** The player model's bone controllers (BG_Player_DoControllersInternal), parents first. */
export const BODY_CONTROLLERS = [
  "pelvis",
  "back_low",
  "back_mid",
  "back_up",
  "neck",
  "head",
] as const;

/** The third-person player at one moment: CoD units and degrees (pitch down positive). */
export interface BodyPose {
  /** Feet origin. */
  x: number;
  y: number;
  z: number;
  /** View angles; the model turns by the yaw. */
  yaw: number;
  pitch: number;
  /** Legs yaw (world); tag_origin turns by legsYaw - yaw. */
  legsYaw: number;
  /** Clips to pose with their final mixer weights; clips left out get weight 0. */
  anims: readonly ViewmodelAnim[];
  /** tag_origin's local tag relative to the model root: [pitch, yaw, roll] and [x, y, z]. */
  origin: { angles: readonly [number, number, number]; offset: readonly [number, number, number] };
  /** Model-space [pitch, yaw, roll] of each BODY_CONTROLLERS bone, in that order. */
  controllers: readonly (readonly [number, number, number])[];
  /** Whether the runner holds a weapon (none on ladders and while mantling). */
  weapon: boolean;
}

export interface WeaponMotion {
  /** CoD2 playerState leanf: -0.5 (full left) to 0.5 (full right), ±0.25 prone. */
  lean: number;
  /** fWeaponPosFrac: 0 at the hip to 1 aimed down the sights. */
  ads?: number;
  /** Gun offset from the eye along the view's forward, left and up axes, CoD units. */
  offset?: readonly [number, number, number];
  /** Gun pitch (down), yaw (left) and roll relative to the view, degrees, before the lean roll. */
  angles?: readonly [number, number, number];
  /** The viewmodel's animation clips to pose; clips left out get weight 0. */
  anims?: readonly ViewmodelAnim[];
  /** The muzzle flash on the viewmodel's tag_flash, or null. */
  flash?: ViewmodelFlash | null;
}

/** A muzzle flash at one moment, in tag_flash's axes (x along the barrel) and CoD units. */
export interface ViewmodelFlash {
  /** Additive camera-facing sprites: atlas frame, radius, roll in degrees, grey colour level. */
  sprites: readonly { frame: number; radius: number; roll: number; color: number }[];
  /** A point light `offset` units down the barrel, with its radius and RGB colour. */
  light: { offset: number; radius: number; color: readonly [number, number, number] };
}

/** One clip of a model GLB (viewmodel or body) at a time (seconds into the clip) and weight. */
export interface ViewmodelAnim {
  clip: string;
  time: number;
  weight: number;
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
