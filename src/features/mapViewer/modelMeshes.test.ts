import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Frustum,
  Group,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";
import { prepareModelMeshes } from "./modelMeshes";

describe("prepareModelMeshes", () => {
  it("keeps a skinned part drawn once its animation leaves the pose it was first drawn in", () => {
    // A gun-sized triangle skinned to one bone, in front of a camera at the origin looking down -Z.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 0.05, 0, 0, 0, 0.05, 0], 3),
    );
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute(
      "skinWeight",
      new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
    );
    const bone = new Bone();
    const gun = new SkinnedMesh(geometry, new MeshBasicMaterial());
    const root = new Group().add(bone, gun);
    root.updateMatrixWorld(true);
    gun.bind(new Skeleton([bone]));
    const surface = new MeshBasicMaterial();
    prepareModelMeshes(root, () => surface);
    expect(gun.material).toBe(surface);

    const camera = new PerspectiveCamera(65, 16 / 9, 0.01, 10);
    camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    // WebGLRenderer.projectObject's test; the first one bounds the mesh in its current pose.
    const drawn = () => {
      root.updateMatrixWorld(true);
      return !gun.frustumCulled || frustum.intersectsObject(gun);
    };
    // First drawn at the start of a raise, below the view; then the idle pose brings it on screen.
    bone.position.set(0, -2, -0.3);
    drawn();
    bone.position.set(0.1, -0.1, -0.3);
    expect(drawn()).toBe(true);
  });
});
