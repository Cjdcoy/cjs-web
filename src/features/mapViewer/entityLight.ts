import {
  DataTexture,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  Vector2,
  Vector3,
  type BufferAttribute,
  type InstancedMesh,
  type IUniform,
  type Material,
  type Mesh,
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
 *
 * Finding that surface by raycasting the render meshes took 5-17 ms per ray on large maps, so the
 * upward-facing lightmapped triangles are binned once into a grid of vertical columns (built a few
 * ms per frame) and a lookup tests only the triangles of one column.
 */

/** Re-sample once the feet moved this far (CoD units). */
const RESAMPLE_UNITS = 1;
/** The search starts above the feet and reaches this far below them (CoD units). */
const RAY_LIFT = 8;
const RAY_DEPTH = 2048;
/** Grid column width (CoD units) and the most build work per frame (ms). */
const CELL_UNITS = 128;
const BUILD_SLICE_MS = 2.5;
/** Triangles per storage chunk, and per build step between time checks. */
const CHUNK = 4096;
const BATCH = 256;

export interface EntityLight {
  /** A lit copy of a glTF model material. */
  material(source: Material): Material;
  /** The map's render node and lighting, once it has loaded. */
  setMap(render: Object3D, lighting: SurfaceLighting): void;
  /** Samples the light below a CoD feet origin when it moved; true when the light changed. */
  update(x: number, y: number, z: number): boolean;
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
  const sampled = new Vector3(Number.NaN, 0, 0);
  const feet = new Vector3();
  let builder: Generator<void, FloorGrid> | null = null;
  let grid: FloorGrid | null = null;

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
      uniforms.litSunColor.value = lighting.sunColor;
      uniforms.litSunDirection.value = lighting.sunDirection;
      // Built on the first update, once the model shows (world matrices are final by then).
      builder = buildFloorGrid(node);
      grid = null;
      sampled.set(Number.NaN, 0, 0);
    },

    update(x, y, z) {
      if (!grid) {
        if (!builder) return false;
        const deadline = performance.now() + BUILD_SLICE_MS;
        let step = builder.next();
        while (!step.done && performance.now() < deadline) step = builder.next();
        if (!step.done) return false;
        grid = step.value;
      }
      feet.set(x, y, z);
      if (feet.distanceToSquared(sampled) < RESAMPLE_UNITS ** 2) return false;
      sampled.copy(feet);
      const hit = floorBelow(grid, x, y, z);
      if (!hit) return false;
      uniforms.litLightmap.value = hit.light.lightmap;
      uniforms.litSunVisibility.value = hit.light.sunVisibility;
      uniforms.litLightmapScale.value = hit.light.scale;
      (uniforms.litUv.value as Vector2).copy(hit.uv);
      return true;
    },

    dispose() {
      materials.forEach((material) => material.dispose());
      white.dispose();
      black.dispose();
    },
  };
}

/** Upward-facing lightmapped triangles in scene space, binned into vertical grid columns. */
export interface FloorGrid {
  /** Per chunk of CHUNK triangles: corner xyz (9 floats each), corner uv1 (6), light index. */
  corners: Float32Array[];
  uvs: Float32Array[];
  lightOf: Uint16Array[];
  lights: LightmapLight[];
  /** Triangle indices by column key. */
  columns: Map<number, number[]>;
}

const CELL = CELL_UNITS * METRES_PER_COD_UNIT;

type LightmapLight = Extract<SurfaceLight, { kind: "lightmap" }>;

function columnKey(column: number, row: number): number {
  return (column + 32768) * 65536 + (row + 32768);
}

/**
 * Collects and bins the floor triangles of `render`'s lightmapped meshes, yielding every BATCH
 * triangles so a caller can spread the work over frames. A ray from above can only meet a triangle
 * facing up, or the back of a double-sided one, so the rest are left out.
 */
export function* buildFloorGrid(render: Object3D): Generator<void, FloorGrid> {
  const grid: FloorGrid = { corners: [], uvs: [], lightOf: [], lights: [], columns: new Map() };
  const lightIndex = new Map<LightmapLight, number>();
  const meshes: Mesh[] = [];
  render.traverse((object) => {
    const mesh = object as Partial<Mesh>;
    const material = mesh.material as Material | undefined;
    const light = material?.userData.litLight as SurfaceLight | undefined;
    if (!mesh.isMesh || light?.kind !== "lightmap" || !mesh.geometry?.attributes.uv1) return;
    if (!lightIndex.has(light)) lightIndex.set(light, grid.lights.push(light) - 1);
    meshes.push(object as Mesh);
  });
  const world = new Matrix4();
  const instance = new Matrix4();
  const p = new Float64Array(9);
  let count = 0;
  let work = 0;
  for (const mesh of meshes) {
    const { geometry } = mesh;
    const material = mesh.material as Material;
    const light = lightIndex.get(material.userData.litLight as LightmapLight) ?? 0;
    const doubleSided = material.side === DoubleSide;
    const position = geometry.attributes.position as BufferAttribute;
    const uv1 = geometry.attributes.uv1 as BufferAttribute;
    const index = geometry.index;
    const corners = index ? index.count : position.count;
    const instanced = (mesh as Partial<InstancedMesh>).isInstancedMesh === true;
    const instances = instanced ? (mesh as InstancedMesh).count : 1;
    for (let k = 0; k < instances; k += 1) {
      world.copy(mesh.matrixWorld);
      if (instanced) world.multiply((mesh as InstancedMesh).getMatrixAt(k, instance));
      const e = world.elements;
      for (let corner = 0; corner + 2 < corners; corner += 3) {
        if (++work % BATCH === 0) yield;
        for (let v = 0; v < 3; v += 1) {
          const vertex = index ? index.getX(corner + v) : corner + v;
          const x = position.getX(vertex);
          const y = position.getY(vertex);
          const z = position.getZ(vertex);
          p[v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          p[v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          p[v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        // The y of (b - a) × (c - a): above 0 the front faces up.
        const up = (p[5] - p[2]) * (p[6] - p[0]) - (p[3] - p[0]) * (p[8] - p[2]);
        if (!(up > 1e-12 || (doubleSided && up < -1e-12))) continue;
        const chunk = Math.floor(count / CHUNK);
        const slot = count % CHUNK;
        if (slot === 0) {
          grid.corners.push(new Float32Array(CHUNK * 9));
          grid.uvs.push(new Float32Array(CHUNK * 6));
          grid.lightOf.push(new Uint16Array(CHUNK));
        }
        grid.corners[chunk].set(p, slot * 9);
        for (let v = 0; v < 3; v += 1) {
          const vertex = index ? index.getX(corner + v) : corner + v;
          grid.uvs[chunk][slot * 6 + v * 2] = uv1.getX(vertex);
          grid.uvs[chunk][slot * 6 + v * 2 + 1] = uv1.getY(vertex);
        }
        grid.lightOf[chunk][slot] = light;
        const columnFrom = Math.floor(Math.min(p[0], p[3], p[6]) / CELL);
        const columnTo = Math.floor(Math.max(p[0], p[3], p[6]) / CELL);
        const rowFrom = Math.floor(Math.min(p[2], p[5], p[8]) / CELL);
        const rowTo = Math.floor(Math.max(p[2], p[5], p[8]) / CELL);
        for (let column = columnFrom; column <= columnTo; column += 1) {
          for (let row = rowFrom; row <= rowTo; row += 1) {
            // A wide triangle (terrain, a big floor) fills many columns: each counts as work.
            if (++work % BATCH === 0) yield;
            const key = columnKey(column, row);
            const list = grid.columns.get(key);
            if (list) list.push(count);
            else grid.columns.set(key, [count]);
          }
        }
        count += 1;
      }
    }
  }
  return grid;
}

const hitUv = new Vector2();

/**
 * The highest grid triangle under a CoD feet origin, from RAY_LIFT above it down to RAY_DEPTH
 * below: its light and the uv1 at that point, or null.
 */
export function floorBelow(
  grid: FloorGrid,
  x: number,
  y: number,
  z: number,
): { light: LightmapLight; uv: Vector2 } | null {
  const [sx, sy, sz] = codToScenePosition(x, y, z + RAY_LIFT);
  const list = grid.columns.get(columnKey(Math.floor(sx / CELL), Math.floor(sz / CELL)));
  if (!list) return null;
  const lowest = sy - (RAY_LIFT + RAY_DEPTH) * METRES_PER_COD_UNIT;
  let best = Number.NEGATIVE_INFINITY;
  let found = -1;
  let bu = 0;
  let bv = 0;
  for (const triangle of list) {
    const c = grid.corners[Math.floor(triangle / CHUNK)];
    const o = (triangle % CHUNK) * 9;
    // Barycentric weights of (sx, sz) in the triangle's xz projection.
    const d =
      (c[o + 5] - c[o + 8]) * (c[o] - c[o + 6]) + (c[o + 6] - c[o + 3]) * (c[o + 2] - c[o + 8]);
    if (d === 0) continue;
    const u =
      ((c[o + 5] - c[o + 8]) * (sx - c[o + 6]) + (c[o + 6] - c[o + 3]) * (sz - c[o + 8])) / d;
    const v = ((c[o + 8] - c[o + 2]) * (sx - c[o + 6]) + (c[o] - c[o + 6]) * (sz - c[o + 8])) / d;
    const w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const height = u * c[o + 1] + v * c[o + 4] + w * c[o + 7];
    if (height > sy || height < lowest || height <= best) continue;
    best = height;
    found = triangle;
    bu = u;
    bv = v;
  }
  if (found < 0) return null;
  const uv = grid.uvs[Math.floor(found / CHUNK)];
  const o = (found % CHUNK) * 6;
  const bw = 1 - bu - bv;
  hitUv.set(
    bu * uv[o] + bv * uv[o + 2] + bw * uv[o + 4],
    bu * uv[o + 1] + bv * uv[o + 3] + bw * uv[o + 5],
  );
  const light = grid.lights[grid.lightOf[Math.floor(found / CHUNK)][found % CHUNK]];
  return { light, uv: hitUv };
}

function pixel(level: number): Texture {
  const texture = new DataTexture(new Uint8Array([level, level, level, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}
