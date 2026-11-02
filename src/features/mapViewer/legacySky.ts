import {
  CubeTexture,
  ShaderMaterial,
  SRGBColorSpace,
  type Material,
  type Side,
  type Texture,
} from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { isRecord, textureIndex } from "./legacySurface";

/**
 * The texture indices of the map converter's MAPCONV_legacy_sky extension: six square sRGB faces
 * in three.js CubeTexture order (+X, −X, +Y, −Y, +Z, −Z), already oriented for glTF space. A map
 * with one sky carries it on the scene, a map that mixes skies on each sky material.
 */
export function parseLegacySky(extensions: unknown): number[] | null {
  const sky = isRecord(extensions) ? extensions.MAPCONV_legacy_sky : undefined;
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
  return faces && loadSkyCube(gltf, faces);
}

export interface MaterialSkies {
  /** The sky material that draws a glTF material carrying its own sky, else null. */
  material(source: Material): Material | null;
  dispose(): void;
}

/**
 * The skies of maps that mix them (mp_12): each sky material's surfaces show its own cube along
 * the view direction, as the background would. One cube per distinct face set; a sky whose faces
 * fail to load leaves its surfaces to the surface materials.
 */
export async function loadMaterialSkies(gltf: GLTF): Promise<MaterialSkies> {
  const json = gltf.parser.json as { materials?: { extensions?: unknown }[] };
  const faceSets = new Map<string, number[]>();
  for (const definition of json.materials ?? []) {
    const faces = parseLegacySky(definition.extensions);
    if (faces) faceSets.set(faces.join(), faces);
  }
  const cubes = new Map(
    await Promise.all(
      [...faceSets].map(async ([key, faces]) => [key, await loadSkyCube(gltf, faces)] as const),
    ),
  );
  const materials = new Map<Material, Material>();
  return {
    material(source) {
      const cube = cubes.get(parseLegacySky(source.userData.gltfExtensions)?.join() ?? "");
      if (!cube) return null;
      let material = materials.get(source);
      if (!material) {
        material = createSkyMaterial(cube, source.side);
        materials.set(source, material);
      }
      return material;
    },
    dispose() {
      materials.forEach((material) => material.dispose());
      cubes.forEach((cube) => cube?.dispose());
    },
  };
}

// three.js's cube background (backgroundCube.glsl.js) looks up backgroundRotation × direction,
// and WebGLBackground sets that to diag(−1, 1, 1) for a cube texture that is not a render target
// and an unrotated scene: the same x mirror is applied here. The direction is per pixel, as sky
// brushes are large and close to the camera, where per-vertex directions would bend the sky.
const SKY_VERTEX = `varying vec3 vSkyDirection;
void main() {
  vec4 worldPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
  vSkyDirection = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
// Like the background: no light, tint or fog, then the output encode and display gamma.
const SKY_FRAGMENT = `uniform samplerCube skyCube;
varying vec3 vSkyDirection;
void main() {
  gl_FragColor = textureCube(skyCube, vec3(-vSkyDirection.x, vSkyDirection.yz));
  #include <colorspace_fragment>
}
`;

/** A surface that shows the sky cube behind it, seamless with a background of the same cube. */
export function createSkyMaterial(cube: CubeTexture, side: Side): ShaderMaterial {
  return new ShaderMaterial({
    name: "legacySky",
    uniforms: { skyCube: { value: cube } },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side,
    toneMapped: false,
  });
}

async function loadSkyCube(gltf: GLTF, faces: number[]): Promise<CubeTexture | null> {
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
