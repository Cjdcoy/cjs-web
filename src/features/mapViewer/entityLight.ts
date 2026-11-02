import {
  DataTexture,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type IUniform,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from "three";
import { codToScenePosition, METRES_PER_COD_UNIT } from "./codSpace";
import type { SurfaceLight, SurfaceLighting } from "./legacySurface";

/*
 * A model entity (the replay's runner) lit the way CoD2 lights models: the light grid's colour at
 * the entity plus the sun where the grid sees it (lprobe shaders), in gamma space like the map's
 * own surfaces. The map GLB has no light grid, so the colour and the sun visibility come from the
 * lightmap of the first lightmapped surface below the feet; the shader samples that texel itself.
 * Until a surface is found the model keeps its texture colours, as unlit map surfaces do.
 */

/**
 * Re-sample once the feet moved this far (CoD units), at most every RESAMPLE_MS: a ray through the
 * render geometry takes 5-17 ms on a large map (no BVH).
 * shortcut: the light lags a moving runner by up to RESAMPLE_MS; a BVH or a light grid exported by
 * the map converter would allow a sample per frame.
 */
const RESAMPLE_UNITS = 16;
const RESAMPLE_MS = 250;
/** The ray starts above the feet and reaches this far below them (CoD units). */
const RAY_LIFT = 8;
const RAY_DEPTH = 2048;

export interface EntityLight {
  /** A lit copy of a glTF model material. */
  material(source: Material): Material;
  /** The map's render node and lighting, once it has loaded. */
  setMap(render: Object3D, lighting: SurfaceLighting): void;
  /** Samples the light below a CoD feet origin when it moved; true when the light changed. */
  update(x: number, y: number, z: number, now: number): boolean;
  dispose(): void;
}

export function createEntityLight(): EntityLight {
  const white = pixel(255);
  const black = pixel(0);
  const uniforms: Record<string, IUniform> = {
    litLightmap: { value: white },
    litSunVisibility: { value: black },
    litUv: { value: new Vector2(0.5, 0.5) },
    litLightmapScale: { value: 1 },
    litSunColor: { value: new Vector3() },
    litSunDirection: { value: new Vector3(0, 1, 0) },
  };
  const materials: Material[] = [];
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  raycaster.far = (RAY_LIFT + RAY_DEPTH) * METRES_PER_COD_UNIT;
  const sampled = new Vector3(Number.NaN, 0, 0);
  const feet = new Vector3();
  let sampledAt = Number.NEGATIVE_INFINITY;
  let render: Object3D | null = null;

  return {
    material(source) {
      const original = source as MeshStandardMaterial;
      const material = new MeshBasicMaterial({
        name: source.name,
        color: original.color,
        map: original.map,
        side: source.side,
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
      });
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        // MeshBasicMaterial computes the (skinned) objectNormal only for skinning or an env map.
        shader.vertexShader = `varying vec3 vLitNormal;\n${shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
#if defined(USE_ENVMAP) || defined(USE_SKINNING)
vLitNormal = normalize(mat3(modelMatrix) * objectNormal);
#else
vLitNormal = normalize(mat3(modelMatrix) * normal);
#endif`,
        )}`;
        shader.fragmentShader = `uniform sampler2D litLightmap, litSunVisibility;
uniform vec2 litUv;
uniform float litLightmapScale;
uniform vec3 litSunColor, litSunDirection;
varying vec3 vLitNormal;
${shader.fragmentShader.replace(
  "#include <color_fragment>",
  `#include <color_fragment>
{
vec3 n = normalize(vLitNormal) * (gl_FrontFacing ? 1.0 : -1.0);
vec3 light = texture2D(litLightmap, litUv).rgb * litLightmapScale
  + texture2D(litSunVisibility, litUv).r * litSunColor * max(dot(litSunDirection, n), 0.0);
diffuseColor.rgb *= pow(max(light, 0.0), vec3(2.2));
}`,
)}`;
      };
      material.customProgramCacheKey = () => "cjs-entity-light";
      materials.push(material);
      return material;
    },

    setMap(node, lighting) {
      render = node;
      uniforms.litSunColor.value = lighting.sunColor;
      uniforms.litSunDirection.value = lighting.sunDirection;
      sampledAt = Number.NEGATIVE_INFINITY;
      sampled.set(Number.NaN, 0, 0);
    },

    update(x, y, z, now) {
      feet.set(x, y, z);
      if (
        !render ||
        now - sampledAt < RESAMPLE_MS ||
        feet.distanceToSquared(sampled) < RESAMPLE_UNITS ** 2
      ) {
        return false;
      }
      sampledAt = now;
      sampled.copy(feet);
      raycaster.set(new Vector3(...codToScenePosition(x, y, z + RAY_LIFT)), down);
      for (const hit of raycaster.intersectObject(render, true)) {
        const material = (hit.object as Partial<{ material: Material }>).material;
        const light = material?.userData.litLight as SurfaceLight | undefined;
        if (light?.kind !== "lightmap" || !hit.uv1) continue;
        uniforms.litLightmap.value = light.lightmap;
        uniforms.litSunVisibility.value = light.sunVisibility;
        uniforms.litLightmapScale.value = light.scale;
        (uniforms.litUv.value as Vector2).copy(hit.uv1);
        return true;
      }
      return false;
    },

    dispose() {
      materials.forEach((material) => material.dispose());
      white.dispose();
      black.dispose();
    },
  };
}

function pixel(level: number): Texture {
  const texture = new DataTexture(new Uint8Array([level, level, level, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}
