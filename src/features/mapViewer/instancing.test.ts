import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";
import { instanceMeshes } from "./instancing";
import { PROBE_ATTRIBUTE } from "./legacySurface";

const triangle = () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  return geometry;
};

const named = <T extends Object3D>(object: T, name: string) => {
  object.userData.name = name;
  return object;
};
// A model placement: the probe entry rides on the placement node, as lightProbe extras do.
const placed = (geometry: BufferGeometry, material: Material, x: number, entry = 0) => {
  const placement = new Group();
  placement.position.x = x;
  placement.scale.setScalar(2);
  placement.userData.entry = entry;
  return placement.add(new Mesh(geometry, material));
};
const probeIndex = (mesh: Mesh) => mesh.parent?.userData.entry as number;
const instanced = (root: Object3D) => {
  const found: InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof InstancedMesh) found.push(object);
  });
  return found;
};
const meshes = (root: Object3D) => {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if ((object as Partial<Mesh>).isMesh) found.push(object as Mesh);
  });
  return found;
};

describe("map instancing", () => {
  it("draws placements sharing geometry and render material as one instanced mesh", () => {
    const rock = triangle();
    const tree = triangle();
    const stone = new MeshBasicMaterial();
    // The same source material lit another way is another render material.
    const ambientStone = new MeshBasicMaterial();
    const render = named(new Group(), "render");
    render.position.y = 10;
    render.add(
      placed(rock, stone, 0, 3),
      placed(rock, stone, 5, 7),
      placed(tree, stone, 1),
      placed(rock, ambientStone, 2),
    );
    const root = new Group().add(render);

    instanceMeshes(root, new Set([render]), probeIndex);
    root.updateMatrixWorld(true);

    const result = instanced(root);
    expect(meshes(root)).toEqual(result);
    // The lone tree and ambient rock stay in their placements; both stone rocks join the layer.
    expect(result.map((mesh) => mesh.count)).toEqual([1, 1, 2]);
    const [lone, , rocks] = result;
    expect(rocks.parent).toBe(render);
    expect(rocks.material).toBe(stone);
    expect(rocks.geometry.attributes.position).toBe(rock.attributes.position);
    expect(rocks.geometry.attributes[PROBE_ATTRIBUTE].array).toEqual(new Float32Array([3, 7]));
    // Second rock: placed at x = 5 with scale 2 inside the layer, which is lifted by 10.
    const matrix = new Matrix4();
    rocks.getMatrixAt(1, matrix);
    const corner = new Vector3(1, 0, 0).applyMatrix4(matrix).applyMatrix4(rocks.matrixWorld);
    expect(corner.toArray()).toEqual([7, 10, 0]);
    // Bounds cover every instance, so culling keeps them all.
    rocks.computeBoundingBox();
    expect(rocks.boundingBox?.max.x).toBe(7);
    // A lone mesh keeps its transform, with an identity instance.
    expect(lone.parent?.position.x).toBe(1);
    lone.getMatrixAt(0, matrix);
    expect(matrix.equals(new Matrix4())).toBe(true);
  });

  it("keeps layers, transparent meshes, hidden objects and debug roots apart", () => {
    const geometry = triangle();
    const material = new MeshBasicMaterial();
    const glass = new MeshBasicMaterial({ transparent: true });
    const render = named(new Group(), "render");
    const models = named(new Group(), "render/models");
    const hidden = placed(geometry, material, 2);
    hidden.userData.hidden = true;
    hidden.visible = false;
    models.add(placed(geometry, material, 0), placed(geometry, material, 1), hidden);
    render.add(
      models,
      placed(geometry, material, 0),
      placed(geometry, material, 1),
      placed(geometry, glass, 0),
      placed(geometry, glass, 1),
    );
    const collision = named(new Group(), "collision").add(new Mesh(geometry, material));
    const entities = named(new Group(), "entities").add(new Mesh(geometry, material));
    const root = new Group().add(render, collision, entities);

    instanceMeshes(root, new Set([render, models, collision, entities]), probeIndex);

    // Per layer: one instanced mesh for both opaque placements; each glass pane stays in place.
    expect(instanced(models).map((mesh) => [mesh.parent, mesh.count])).toEqual([[models, 2]]);
    expect(instanced(render).filter((mesh) => mesh.parent === render)).toHaveLength(1);
    const panes = instanced(render).filter((mesh) => mesh.material === glass);
    expect(panes.map((mesh) => [mesh.count, mesh.parent?.position.x])).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(meshes(hidden)).toHaveLength(1);
    expect(instanced(hidden)).toHaveLength(0);
    expect(instanced(collision)).toHaveLength(0);
    expect(instanced(entities)).toHaveLength(0);
    expect(meshes(collision)).toHaveLength(1);
    expect(meshes(entities)).toHaveLength(1);
  });
});
