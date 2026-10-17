import {
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { PROBE_ATTRIBUTE } from "./legacySurface";

// Debug overlays: collision is raycast per mesh by the ground probe, entities are markers.
const UNINSTANCED_ROOTS = new Set(["collision", "entities"]);

/**
 * Draws the rendered map's meshes as one InstancedMesh per layer, geometry and render material.
 * glTF shares one geometry per primitive across model placements and render materials are shared
 * per source material and light kind, so each model's placements collapse into one draw call. Run
 * it after render materials are assigned. Instances are placed relative to their layer and added
 * to it, so toggling `layers` still shows and hides them, and each carries its placement's probe
 * palette entry (probe materials read it from there, so every mesh becomes an InstancedMesh). A
 * transparent mesh gets one of its own in its own place, which three.js still sorts back to front.
 * ponytail: an InstancedMesh is culled as a whole; group by spatial cell too if big maps regress.
 */
export function instanceMeshes(
  root: Object3D,
  layers: ReadonlySet<Object3D>,
  probeIndex: (mesh: Mesh) => number,
): void {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { layer: Object3D; meshes: Mesh<BufferGeometry, Material>[] }>();
  const collect = (object: Object3D, layer: Object3D) => {
    if (!object.visible || object.userData.hidden) return;
    if (layers.has(object)) layer = object;
    else if (isInstanceable(object)) {
      const { geometry, material } = object;
      const key = material.transparent
        ? object.uuid
        : `${layer.id}|${geometry.uuid}|${material.uuid}`;
      const group = groups.get(key) ?? { layer, meshes: [] };
      group.meshes.push(object);
      groups.set(key, group);
    }
    object.children.forEach((child) => collect(child, layer));
  };
  for (const node of root.children) {
    if (!UNINSTANCED_ROOTS.has(nameOf(node))) collect(node, node);
  }

  const toLayer = new Matrix4();
  for (const { layer, meshes } of groups.values()) {
    const [{ geometry, material }] = meshes;
    // A geometry of its own for the per-instance attribute; the vertex buffers stay shared, so
    // disposing one frees them for all (fine at teardown, where all go together).
    const instanceGeometry = Object.assign(new BufferGeometry(), {
      index: geometry.index,
      attributes: {
        ...geometry.attributes,
        [PROBE_ATTRIBUTE]: new InstancedBufferAttribute(
          new Float32Array(meshes.map(probeIndex)),
          1,
        ),
      },
      boundingBox: geometry.boundingBox,
      boundingSphere: geometry.boundingSphere,
    });
    const instanced = new InstancedMesh(instanceGeometry, material, meshes.length);
    if (meshes.length === 1) {
      // A lone mesh keeps its place and an identity instance, so it draws bit for bit as before.
      const [mesh] = meshes;
      instanced.matrixAutoUpdate = false;
      instanced.matrix.copy(mesh.matrix);
      mesh.parent?.add(instanced);
      mesh.removeFromParent();
      continue;
    }
    const inverse = new Matrix4().copy(layer.matrixWorld).invert();
    meshes.forEach((mesh, index) => {
      instanced.setMatrixAt(index, toLayer.multiplyMatrices(inverse, mesh.matrixWorld));
      mesh.removeFromParent();
    });
    layer.add(instanced);
  }
}

function isInstanceable(object: Object3D): object is Mesh<BufferGeometry, Material> {
  const { material, geometry } = object as Mesh;
  return (
    // Not SkinnedMesh, InstancedMesh, lines or points.
    object.type === "Mesh" &&
    // Removing a parent would drop its children.
    object.children.length === 0 &&
    !Array.isArray(material) &&
    Object.keys(geometry.morphAttributes).length === 0
  );
}

function nameOf(object: Object3D): string {
  const original: unknown = object.userData.name;
  return typeof original === "string" ? original : object.name;
}
