import { VIEW_FIELD_OF_VIEW, type CodPose } from "./codSpace";

/**
 * luger_mp2's hip reticle, the weapon the replays draw (jump4life/mods/cod2/zzz/weapons/mp/luger_mp2):
 * reticleCenter is empty, reticleSide is gfx/reticle/side_skinny_xenon, reticleSideSize 6,
 * reticleMinOfs 0 and hipSpreadStandMin 1 (degrees).
 */
const RETICLE_SIDE_SIZE = 6;
const RETICLE_MIN_OFS = 0;
const HIP_SPREAD_STAND_MIN = 1;
/** side_skinny_xenon is 8×8 texels: a 1-texel white line 5 texels long, ending at the quad's inner edge, outlined in black. */
const SIDE_TEXELS = 8;
const LINE_TEXELS = 5;

export interface HipReticle {
  /** Pixels from the view centre to each tick's inner end. */
  offset: number;
  /** Tick line width and length, and its dark outline, in pixels. */
  width: number;
  length: number;
  outline: number;
  /** Half a pixel for odd widths: centres the ticks on a pixel so 1 px lines stay sharp. */
  nudge: number;
}

/**
 * CG_DrawCrosshair's side reticles (CoD2 MP 1.3 Mac decompile, Call_of_Duty_2_Multiplayer_MAC_1.3.c
 * :347175-347242; spread from BG_GetSpreadForWeapon :145946): four reticleSideSize squares on the
 * 640×480 virtual screen, rotated 0/90/180/270°, each with its inner edge
 * max(reticleMinOfs, tan(spread) · 240 / tan(fov_y / 2)) from the centre, white at
 * cg_crosshairAlpha 1 · (1 - aimSpreadScale / 255). Scaled by the view height like the game's
 * virtual screen, with whole-pixel minimums so small views stay crisp. The texture's 1-texel black
 * outline reads as a faint edge once filtered in game, so it is drawn half as wide.
 * ponytail: drawn at the standing minimum spread with aimSpreadScale 0; spread growth (and the
 * alpha fade) while moving, jumping or crouching isn't modelled. The weapDef+700 term the game
 * subtracts (0 for the luger) is left out.
 */
export function hipReticle(viewHeight: number, fieldOfView = VIEW_FIELD_OF_VIEW): HipReticle {
  const scale = viewHeight / 480;
  const radians = Math.PI / 180;
  const spreadOffset =
    (Math.tan(HIP_SPREAD_STAND_MIN * radians) * 240) / Math.tan((fieldOfView / 2) * radians);
  const texel = (RETICLE_SIDE_SIZE / SIDE_TEXELS) * scale;
  const width = Math.max(1, Math.round(texel));
  return {
    offset: Math.round(Math.max(RETICLE_MIN_OFS, spreadOffset) * scale),
    width,
    length: Math.max(3, Math.round(LINE_TEXELS * texel)),
    outline: Math.max(1, Math.round(texel / 2)),
    nudge: (width % 2) / 2,
  };
}

export const MIN_FLY_SPEED = 10;
export const MAX_FLY_SPEED = 20_000;
/** A mouse wheel notch (about 100 px) scales the fly speed by 1.25; trackpad deltas add up smoothly. */
const WHEEL_STEP = 1.25;
const WHEEL_NOTCH_PX = 100;
/** Caps one event so a fast fling or a page-mode wheel moves at most two notches. */
const WHEEL_MAX_PX = 200;

/** Fly speed after a wheel event; deltaMode 1 counts lines, 2 pages (WheelEvent.DOM_DELTA_*). */
export function flySpeedAfterWheel(speed: number, deltaY: number, deltaMode: number): number {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1);
  const step = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, pixels)) / WHEEL_NOTCH_PX;
  return Math.min(MAX_FLY_SPEED, Math.max(MIN_FLY_SPEED, speed * WHEEL_STEP ** -step));
}

/** Free-camera readout: "x y z" and "pitch yaw roll" like the game's poshud, then the speeds. */
export function cameraReadout(pose: CodPose, speed: number, flySpeed: number): string {
  const format = (values: readonly number[]) =>
    values.map((value) => (Math.round(value * 100) / 100 || 0).toFixed(2)).join(" ");
  return [
    format([pose.x, pose.y, pose.z]),
    format([pose.pitch, pose.yaw, 0]),
    `${Math.round(speed)} u/s (fly speed ${Math.round(flySpeed)})`,
  ].join("\n");
}
