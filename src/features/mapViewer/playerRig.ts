import {
  AnimationClip,
  AnimationMixer,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Object3D,
  type Skeleton,
  type SkinnedMesh,
} from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BODY_CONTROLLERS, codToScenePosition, type BodyPose } from "./codSpace";
import { isRecord } from "./legacySurface";

/*
 * The third-person player GLB's runtime side (model-src/player-anims/out/READY.md §2-4, §8;
 * its scripts/playerRig.mjs is the reference these were ported from).
 */

/** The GLB's one animation holding every xanim, one after another. */
const CLIPS_ANIMATION = "xanims";
const UP = new Vector3(0, 1, 0);

/**
 * Cuts the GLB's "xanims" animation back into one AnimationClip per xanim. Clip k's keys sit at
 * extras.clips[k].start + frame / framerate, and a track has keys in that range exactly when the
 * xanim lists the bone, so a bone the xanim does not list gets no track in its clip.
 */
export function splitClips(gltf: Pick<GLTF, "animations" | "parser">): AnimationClip[] {
  const json: unknown = gltf.parser.json;
  const animations = isRecord(json) && Array.isArray(json.animations) ? json.animations : [];
  const index = animations.findIndex(
    (animation) => isRecord(animation) && animation.name === CLIPS_ANIMATION,
  );
  const atlas = gltf.animations[index];
  const extras: unknown = index >= 0 && isRecord(animations[index]) && animations[index].extras;
  if (!atlas || !isRecord(extras) || !Array.isArray(extras.clips)) return [];
  const clips: AnimationClip[] = [];
  for (const definition of extras.clips) {
    if (!isRecord(definition)) continue;
    const { duration, name, start } = definition;
    if (typeof name !== "string" || typeof start !== "number" || typeof duration !== "number") {
      continue;
    }
    const from = lowerBoundOf(start - 1e-4);
    const to = lowerBoundOf(start + duration + 1e-4);
    const tracks = atlas.tracks.flatMap((track) => {
      const a = from(track.times);
      const b = to(track.times);
      if (a === b) return [];
      const size = track.getValueSize();
      const times = track.times.slice(a, b).map((time) => Math.max(0, time - start));
      const Track = track.constructor as new (
        name: string,
        times: ArrayLike<number>,
        values: ArrayLike<number>,
      ) => typeof track;
      return [new Track(track.name, times, track.values.slice(a * size, b * size))];
    });
    const clip = new AnimationClip(name, duration, tracks);
    clip.userData = definition;
    clips.push(clip);
  }
  return clips;
}

/** The first index of a sorted array at or above `value`. */
function lowerBoundOf(value: number) {
  return (sorted: ArrayLike<number>) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}

/**
 * The rotation DObjSetLocalTagInternal builds from CoD angles in degrees (yaw about z, then pitch
 * about y, then roll about x; positive pitch turns +x down), in the glTF frame, where CoD (x, y, z)
 * is (x, z, -y).
 */
export function codQuaternion(
  pitch: number,
  yaw: number,
  roll: number,
  target = new Quaternion(),
): Quaternion {
  const half = Math.PI / 360;
  const [sy, cy] = [Math.sin(yaw * half), Math.cos(yaw * half)];
  const [sp, cp] = [Math.sin(pitch * half), Math.cos(pitch * half)];
  const [sr, cr] = [Math.sin(roll * half), Math.cos(roll * half)];
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;
  const w = cr * cp * cy + sr * sp * sy;
  return target.set(x, z, -y, w);
}

export interface PlayerRig {
  /** The model root (`player`), standing at the feet origin. */
  root: Object3D;
  /** Poses the model: placement, clips evaluated at their times, tag_origin and the controllers. */
  pose(body: BodyPose): void;
  dispose(): void;
}

/** Wraps a loaded player GLB: one mixer action per xanim, the controller bones and the gun. */
export function createPlayerRig(gltf: GLTF): PlayerRig {
  const root = gltf.scene.getObjectByName("player") ?? gltf.scene;
  const mixer = new AnimationMixer(gltf.scene);
  const actions = new Map<string, AnimationAction>();
  for (const clip of splitClips(gltf)) actions.set(clip.name, mixer.clipAction(clip).play());
  const tag = root.getObjectByName("tag_origin");
  const bones = BODY_CONTROLLERS.map((name) => root.getObjectByName(name));
  const weapon = root.getObjectByName("weapon_luger");
  // GLTFLoader may give each skinned mesh its own Skeleton over the same bones.
  const skeletons = new Set<Skeleton>();
  root.traverse((object) => {
    if ((object as Partial<SkinnedMesh>).isSkinnedMesh)
      skeletons.add((object as SkinnedMesh).skeleton);
  });
  const weights = new Map<string, { time: number; weight: number }>();
  return {
    root,
    pose(body) {
      root.position.set(...codToScenePosition(body.x, body.y, body.z));
      root.quaternion.setFromAxisAngle(UP, (body.yaw * Math.PI) / 180);
      weights.clear();
      for (const anim of body.anims) weights.set(anim.clip, anim);
      // Every clip's time and weight, then one evaluation with no time step: a pure pose.
      for (const [clip, action] of actions) {
        const anim = weights.get(clip);
        action.time = anim?.time ?? 0;
        action.weight = anim?.weight ?? 0;
      }
      mixer.update(0);
      if (tag) {
        const [pitch, yaw, roll] = body.origin.angles;
        codQuaternion(pitch, yaw, roll, tag.quaternion);
        tag.position.set(...codToScenePosition(...body.origin.offset));
      }
      if (weapon) weapon.visible = body.weapon;
      applyControllers(root, bones, body.controllers);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      skeletons.forEach((skeleton) => skeleton.dispose());
    },
  };
}

const parentRotation = new Quaternion();
const control = new Quaternion();
const rootInverse = new Matrix4();
const parentInModel = new Matrix4();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();

/**
 * Sets each controller bone like DObjCalcSkel (CoD2rev dobj.cpp): its model-space rotation is the
 * control rotation times its parent's model-space rotation, so a control turns everything below the
 * bone about the model's own axes (x forward along the view yaw, z up). No clip animates these bones;
 * they keep their rest positions. Runs after the mixer and tag_origin, and updates the world matrices.
 */
function applyControllers(
  root: Object3D,
  bones: readonly (Object3D | undefined)[],
  angles: BodyPose["controllers"],
): void {
  root.updateMatrixWorld(true);
  rootInverse.copy(root.matrixWorld).invert();
  bones.forEach((bone, index) => {
    if (!bone?.parent) return;
    const [pitch, yaw, roll] = angles[index] ?? [0, 0, 0];
    parentInModel
      .multiplyMatrices(rootInverse, bone.parent.matrixWorld)
      .decompose(scratchPosition, parentRotation, scratchScale);
    codQuaternion(pitch, yaw, roll, control);
    // local = parent⁻¹ · control · parent, so model = parent · local = control · parent.
    bone.quaternion.copy(parentRotation).invert().multiply(control).multiply(parentRotation);
    bone.updateMatrixWorld(true);
  });
}
