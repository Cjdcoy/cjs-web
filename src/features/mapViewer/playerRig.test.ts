import {
  AnimationClip,
  Bone,
  Group,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { describe, expect, it } from "vitest";
import type { BodyPose } from "./codSpace";
import { codQuaternion, createPlayerRig, splitClips } from "./playerRig";

describe("splitClips", () => {
  // Two xanims on one timeline, a whole second apart: "a" lists bone_a and bone_b, "b" only bone_a.
  const atlas = new AnimationClip("xanims", -1, [
    new VectorKeyframeTrack(
      "bone_a.position",
      [0, 0.5, 1, 2, 2.25],
      [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0],
    ),
    new QuaternionKeyframeTrack("bone_b.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 1, 0]),
  ]);
  const clips = [
    { name: "a", start: 0, duration: 1, looping: true, moveSpeed: 10 },
    { name: "b", start: 2, duration: 0.25, looping: false, moveSpeed: 0 },
  ];
  const gltf = {
    animations: [new AnimationClip("other", 1, []), atlas],
    parser: { json: { animations: [{ name: "other" }, { name: "xanims", extras: { clips } }] } },
  } as unknown as Parameters<typeof splitClips>[0];

  it("cuts one clip per xanim with its own keys from 0 and its extras", () => {
    const [a, b] = splitClips(gltf);
    expect(a.name).toBe("a");
    expect(a.duration).toBe(1);
    expect(a.userData).toEqual(clips[0]);
    expect(a.tracks.map((track) => track.name)).toEqual(["bone_a.position", "bone_b.quaternion"]);
    expect([...a.tracks[0].times]).toEqual([0, 0.5, 1]);
    expect([...a.tracks[0].values]).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    expect(a.tracks[1]).toBeInstanceOf(QuaternionKeyframeTrack);
    expect(b.name).toBe("b");
    expect(b.tracks.map((track) => track.name)).toEqual(["bone_a.position"]);
    expect([...b.tracks[0].times]).toEqual([0, 0.25]);
    expect([...b.tracks[0].values]).toEqual([3, 0, 0, 4, 0, 0]);
  });

  it("gives no clips without the xanims animation or its extras", () => {
    expect(splitClips({ ...gltf, parser: { json: {} } } as typeof gltf)).toEqual([]);
  });
});

describe("codQuaternion", () => {
  it("turns CoD +x to the glTF frame: yaw about up, positive pitch down", () => {
    const forward = (pitch: number, yaw: number) => {
      const q = codQuaternion(pitch, yaw, 0);
      // glTF +x is CoD +x; CoD (x, y, z) is glTF (x, z, -y).
      const x = 1 - 2 * (q.y * q.y + q.z * q.z);
      const y = 2 * (q.x * q.y + q.w * q.z);
      const z = 2 * (q.x * q.z - q.w * q.y);
      return [x, y, z].map((value) => Math.round(value * 1e6) / 1e6 + 0);
    };
    // Yaw 90 faces CoD +y, glTF -z; pitch 90 faces CoD -z, glTF -y.
    expect(forward(0, 90)).toEqual([0, 0, -1]);
    expect(forward(90, 0)).toEqual([0, -1, 0]);
  });
});

describe("createPlayerRig", () => {
  // player > tag_origin > pelvis > back_low > back_mid > back_up > neck > head, each bone a little
  // above the last and turned at rest, as the GLB's are.
  function rig() {
    const scene = new Group();
    const root = new Group();
    root.name = "player";
    scene.add(root);
    let parent: Group | Bone = root;
    for (const name of [
      "tag_origin",
      "pelvis",
      "back_low",
      "back_mid",
      "back_up",
      "neck",
      "head",
    ]) {
      const bone = new Bone();
      bone.name = name;
      bone.position.set(0, 0.1, 0);
      bone.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.2);
      parent.add(bone);
      parent = bone;
    }
    const gltf = { scene, animations: [], parser: { json: {} } } as unknown as Parameters<
      typeof createPlayerRig
    >[0];
    return { scene, root, player: createPlayerRig(gltf) };
  }

  const pose: BodyPose = {
    x: 100,
    y: 50,
    z: 10,
    yaw: 90,
    pitch: 0,
    legsYaw: 120,
    anims: [],
    origin: { angles: [0, 30, 0], offset: [0, -5, 0] },
    controllers: [
      [0, 0, 0],
      [5, 20, 0],
      [0, 0, 0],
      [0, -10, 4],
      [0, 0, 0],
      [8, 0, 0],
    ],
    weapon: true,
  };

  it("stands at the feet, turned by the view yaw, with tag_origin's local tag", () => {
    const { root, player } = rig();
    player.pose(pose);
    expect(root.position.toArray().map((value) => +value.toFixed(6))).toEqual([2.54, 0.254, -1.27]);
    expect(
      root.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)),
    ).toBeCloseTo(0, 6);
    const tag = root.getObjectByName("tag_origin");
    expect(tag?.quaternion.angleTo(codQuaternion(0, 30, 0))).toBeCloseTo(0, 6);
    // CoD y -5 (right) is glTF +z.
    expect(tag?.position.toArray().map((value) => +value.toFixed(6))).toEqual([0, 0, 0.127]);
  });

  it("gives each controller bone the control rotation times its parent's, in model space", () => {
    const { root, player } = rig();
    player.pose(pose);
    const model = (name: string) => {
      const bone = root.getObjectByName(name);
      const world = new Quaternion();
      bone?.getWorldQuaternion(world);
      return root.quaternion.clone().invert().multiply(world);
    };
    for (const [index, name] of ["back_low", "back_up", "head"].entries()) {
      const [pitch, yaw, roll] = pose.controllers[[1, 3, 5][index]];
      const parent = model(root.getObjectByName(name)?.parent?.name ?? "");
      const expected = codQuaternion(pitch, yaw, roll).multiply(parent);
      expect(model(name).angleTo(expected)).toBeCloseTo(0, 5);
    }
  });
});
