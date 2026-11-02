import type { Material, Mesh, Object3D } from "three";

/**
 * Gives every single-material mesh of a loaded model the material `material` makes for it, and keeps
 * every mesh out of frustum culling: three.js bounds a skinned mesh once, in the pose it is first
 * drawn in, and the model's animations leave those bounds (the viewmodel's raise, the player's prone,
 * jumps and mantles), so an on-screen part would be culled.
 */
export function prepareModelMeshes(
  root: Object3D,
  material: (mesh: Mesh, current: Material) => Material,
): void {
  root.traverse((object) => {
    const mesh = object as Partial<Mesh>;
    if (!mesh.isMesh) return;
    object.frustumCulled = false;
    if (mesh.material && !Array.isArray(mesh.material)) {
      mesh.material = material(object as Mesh, mesh.material);
    }
  });
}
