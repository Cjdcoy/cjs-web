import { CubeTexture, SRGBColorSpace, type Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { isRecord, textureIndex } from "./legacySurface";

/**
 * The texture indices of the map converter's MAPCONV_legacy_sky scene extension: six square sRGB
 * faces in three.js CubeTexture order (+X, −X, +Y, −Y, +Z, −Z), already oriented for glTF space.
 */
export function parseLegacySky(sceneExtensions: unknown): number[] | null {
  const sky = isRecord(sceneExtensions) ? sceneExtensions.MAPCONV_legacy_sky : undefined;
  if (!isRecord(sky) || !Array.isArray(sky.faces) || sky.faces.length !== 6) return null;
  const faces = sky.faces.map(textureIndex);
  return faces.every((face) => face !== null) ? (faces as number[]) : null;
}

/**
 * The game draws the sky cube as is (no tint, brightness, or fog), so it becomes the scene
 * background, unrotated. A map without one, or with faces that fail to load, keeps the flat colour.
 */
export async function loadLegacySky(gltf: GLTF): Promise<CubeTexture | null> {
  const faces = parseLegacySky(gltf.scene.userData.gltfExtensions);
  if (!faces) return null;
  try {
    const textures = (await Promise.all(
      faces.map((face) => gltf.parser.getDependency("texture", face)),
    )) as Texture[];
    // glTF images load top row first, the orientation the faces were prepared for.
    const sky = new CubeTexture(textures.map((texture) => texture.image));
    sky.colorSpace = SRGBColorSpace;
    sky.needsUpdate = true;
    return sky;
  } catch {
    return null;
  }
}
