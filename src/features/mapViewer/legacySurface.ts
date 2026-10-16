import {
  CustomBlending,
  DoubleSide,
  Matrix3,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoColorSpace,
  OneFactor,
  SrcColorFactor,
  Vector2,
  Vector3,
  ZeroFactor,
  type IUniform,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The map converter's MAPCONV_legacy_surface material extension (its GLB_EXTENSIONS.md): what CoD2
 * shading needs beyond glTF. Texture fields are glTF texture indices.
 */
export interface LegacySurface {
  lighting: "lit" | "ambient" | "unlit";
  alphaTest: "gt0" | "ge128" | "lt128" | null;
  blend: "add" | "multiply" | null;
  detail: { texture: number; scale: [number, number] } | null;
  /** `scale` multiplies the lightmap so 8-bit images can hold light above 1 (CoD4 writes 2). */
  lightmap: { texture: number; sun: number; scale: number } | null;
}

/** The light inputs shared by one glTF's render materials. */
export interface SurfaceLighting {
  /** The render node's sunColor, in gamma space. */
  sunColor: Vector3;
  /** Unit vector towards the sun, in scene space. */
  sunDirection: Vector3;
  /** The extension's data textures by glTF texture index, without colour conversion. */
  textures: Map<number, Texture>;
}

/** A model placement's lighting sample: 8 RGB colours (0–255, interleaved) and sun visibility (0–255). */
export interface LightProbe {
  colors: readonly number[];
  sunVisibility: number;
}

export type SurfaceLight =
  | { kind: "lightmap"; lightmap: Texture; sunVisibility: Texture; scale: number }
  | { kind: "probe" | "ambient"; probe: LightProbe }
  /** Colour as is. */
  | { kind: "none" }
  /** No game lighting: Lambert under the three.js scene lights. */
  | { kind: "scene" };

export interface SurfaceMaterials {
  /** The material that draws a render mesh the way the game lights it. */
  material(mesh: Mesh): Material;
  dispose(): void;
}

type Vec3 = [number, number, number];

const SURFACE_EXTENSION = "MAPCONV_legacy_surface";
const ALPHA_CUTOFFS = { gt0: 0.5 / 255, ge128: 128 / 255, lt128: 128 / 255 } as const;

/** A CoD direction (Z up) in scene space (glTF Y up): (x, y, z) → (x, z, −y). */
export function codToSceneDirection([x, y, z]: readonly number[]): Vec3 {
  return [x, z, -y];
}

// lprobe_sm*.hlsl's lookup basis, given in CoD space and kept in scene space like the normals.
const PROBE_BASIS = [
  [0.81649658, 0, 0.57735027],
  [-0.40824829, 0.70710678, 0.57735027],
  [-0.40824829, -0.70710678, 0.57735027],
].map(codToSceneDirection);
// GLSL `n * m` dots n with each column; fromArray is column-major, so the columns are the axes.
const PROBE_BASIS_MATRIX = new Matrix3().fromArray(PROBE_BASIS.flat());

/**
 * probe(N) of the extension for a scene-space unit normal, in gamma space: the normal in the probe
 * basis, pushed onto the unit cube, trilinearly mixes the 8 colours (index x + 2y + 4z). The
 * `probe` shader below computes the same per pixel.
 */
export function probeLight(colors: readonly number[], normal: readonly number[]): Vec3 {
  const p = PROBE_BASIS.map(
    (axis) => axis[0] * normal[0] + axis[1] * normal[1] + axis[2] * normal[2],
  );
  const scale = Math.max(...p.map(Math.abs));
  const [x, y, z] = p.map((value) => (value / scale) * 0.5 + 0.5);
  const light: Vec3 = [0, 0, 0];
  for (let corner = 0; corner < 8; corner += 1) {
    const weight = (corner & 1 ? x : 1 - x) * (corner & 2 ? y : 1 - y) * (corner & 4 ? z : 1 - z);
    for (let channel = 0; channel < 3; channel += 1) {
      light[channel] += (weight * colors[corner * 3 + channel]) / 255;
    }
  }
  return light;
}

/** lprobe_sm_amb*.hlsl: the mean of the 8 probe colours plus the visible sun, in gamma space. */
export function ambientLight(
  { colors, sunVisibility }: LightProbe,
  sunColor: readonly number[],
): Vec3 {
  return [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let corner = 0; corner < 8; corner += 1) sum += colors[corner * 3 + channel];
    return sum / 8 / 255 + (sunVisibility / 255) * sunColor[channel];
  }) as Vec3;
}

export function parseLegacySurface(value: unknown): LegacySurface | null {
  if (!isRecord(value)) return null;
  const lighting = oneOf(["lit", "ambient", "unlit"] as const, value.lighting);
  if (!lighting) return null;
  const detail = textureIndex(value.detailMap);
  const scale = value.detailScale;
  const lightmap = textureIndex(value.lightmap);
  const sun = textureIndex(value.lightmapSun);
  const lightmapScale = typeof value.lightmapScale === "number" ? value.lightmapScale : 1;
  return {
    lighting,
    alphaTest: oneOf(["gt0", "ge128", "lt128"] as const, value.alphaTest),
    blend: oneOf(["add", "multiply"] as const, value.blend),
    detail:
      detail !== null && isNumbers(scale, 2)
        ? { texture: detail, scale: [scale[0], scale[1]] }
        : null,
    lightmap:
      lightmap !== null && sun !== null ? { texture: lightmap, sun, scale: lightmapScale } : null,
  };
}

/**
 * The sun from the `render` node and the extension's data textures. A texture that does not load
 * drops only the feature that needs it.
 */
export async function loadSurfaceLighting(gltf: GLTF): Promise<SurfaceLighting> {
  const render = gltf.scene.children.find(
    (node) => node.userData.name === "render" || node.name === "render",
  );
  const sunColor: unknown = render?.userData.sunColor;
  const sunDirection: unknown = render?.userData.sunDirection;
  const json = gltf.parser.json as { materials?: { extensions?: Record<string, unknown> }[] };
  const indices = new Set<number>();
  for (const definition of json.materials ?? []) {
    const surface = parseLegacySurface(definition.extensions?.[SURFACE_EXTENSION]);
    if (surface?.detail) indices.add(surface.detail.texture);
    if (surface?.lightmap) indices.add(surface.lightmap.texture).add(surface.lightmap.sun);
  }
  const textures = new Map<number, Texture>();
  await Promise.all(
    [...indices].map(async (index) => {
      try {
        let texture = (await gltf.parser.getDependency("texture", index)) as Texture;
        if (texture.colorSpace !== NoColorSpace) {
          // Shared with a colour map, which is sRGB; data is sampled as stored.
          texture = texture.clone();
          texture.colorSpace = NoColorSpace;
        }
        textures.set(index, texture);
      } catch {
        // Missing data texture: its surfaces draw without that feature.
      }
    }),
  );
  return {
    // Without a sun, lit surfaces get the lightmap or probe alone.
    sunColor: new Vector3(...(isNumbers(sunColor, 3) ? sunColor : [0, 0, 0])),
    sunDirection: new Vector3(
      ...codToSceneDirection(isNumbers(sunDirection, 3) ? sunDirection : [0, 0, 1]),
    ),
    textures,
  };
}

/** Picks a render mesh's lighting from the extension's table. */
export function surfaceLight(mesh: Mesh, lighting: SurfaceLighting): SurfaceLight {
  const source = mesh.material as Material;
  const surface = surfaceOf(source);
  const probe = probeOf(mesh);
  if (!surface) {
    if ((source as Partial<MeshBasicMaterial>).isMeshBasicMaterial) return { kind: "none" };
    // A flat fallback colour for a missing game material: lit like a model, or by the scene lights.
    return probe ? { kind: "probe", probe } : { kind: "scene" };
  }
  const lightmap = surface.lightmap && lighting.textures.get(surface.lightmap.texture);
  const sunVisibility = surface.lightmap && lighting.textures.get(surface.lightmap.sun);
  if (
    surface.lighting === "lit" &&
    surface.lightmap &&
    lightmap &&
    sunVisibility &&
    mesh.geometry.attributes.uv1
  ) {
    return { kind: "lightmap", lightmap, sunVisibility, scale: surface.lightmap.scale };
  }
  if (surface.lighting !== "unlit" && probe) {
    return { kind: surface.lighting === "ambient" ? "ambient" : "probe", probe };
  }
  return { kind: "none" };
}

/** Render materials for one glTF, shared between meshes that light the same way. */
export function createSurfaceMaterials(lighting: SurfaceLighting): SurfaceMaterials {
  const cache = new Map<string, Material>();
  return {
    material(mesh) {
      const source = mesh.material as Material;
      const light = surfaceLight(mesh, lighting);
      const key = `${source.uuid}|${light.kind}|${"probe" in light ? `${light.probe.colors.join()}:${light.probe.sunVisibility}` : ""}`;
      let material = cache.get(key);
      if (!material) {
        material = createMaterial(source, light, lighting);
        cache.set(key, material);
      }
      return material;
    },
    dispose() {
      cache.forEach((material) => material.dispose());
      lighting.textures.forEach((texture) => texture.dispose());
    },
  };
}

// The shaders work on gamma-space values and three.js colours are linear: multiplying linear
// colour by pow(light, 2.2) matches the game's colour × light.
const APPLY_LIGHT = "diffuseColor.rgb *= pow(max(light, 0.0), vec3(2.2));\n";
const SUN = "litSunColor * max(dot(litSunDirection, n), 0.0)";
const NORMAL_VERTEX = "vLitNormal = normalize(mat3(modelMatrix) * normal);\n";
const PROBE_GLSL = `vec3 p = n * litProbeBasis;
p = p / max(abs(p.x), max(abs(p.y), abs(p.z))) * 0.5 + 0.5;
vec3 light = mix(mix(mix(litProbe[0], litProbe[1], p.x), mix(litProbe[2], litProbe[3], p.x), p.y),
  mix(mix(litProbe[4], litProbe[5], p.x), mix(litProbe[6], litProbe[7], p.x), p.y), p.z)
  + litProbeSun * ${SUN};
`;

/**
 * glTF's default material is fully metallic and renders black without an environment map, so game
 * surfaces become unlit materials patched with the extension's shading; fallback colours without
 * game light become Lambert.
 */
function createMaterial(
  source: Material,
  light: SurfaceLight,
  lighting: SurfaceLighting,
): Material {
  const surface = surfaceOf(source);
  const original = source as MeshStandardMaterial;
  // With BLEND, glTF drops the cutoff, so the extension's test is applied on top of the blend.
  const alphaTest = surface?.alphaTest ? ALPHA_CUTOFFS[surface.alphaTest] : source.alphaTest;
  const parameters = {
    name: source.name,
    color: original.color,
    map: original.map,
    vertexColors: source.vertexColors,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest,
    side: DoubleSide,
    depthWrite: source.depthWrite,
    // Blended and alpha-tested surfaces are mostly decals on coplanar surfaces.
    polygonOffset: source.transparent || alphaTest > 0,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  };
  if (light.kind === "scene") return new MeshLambertMaterial(parameters);

  const material = new MeshBasicMaterial(parameters);
  const uniforms: Record<string, IUniform> = {
    litSunColor: { value: lighting.sunColor },
    litSunDirection: { value: lighting.sunDirection },
  };
  const patch = {
    vertexHead: "",
    vertex: "",
    fragmentHead: "",
    afterMap: "",
    afterColor: "",
    alphaTest: "",
  };

  const detail = surface?.detail && lighting.textures.get(surface.detail.texture);
  if (surface?.detail && detail && material.map) {
    // shade.hlsl: colour += detail(uv × detailScale) − 0.5, in gamma space, before vertex colour.
    uniforms.litDetailMap = { value: detail };
    uniforms.litDetailScale = { value: new Vector2(...surface.detail.scale) };
    patch.fragmentHead += "uniform sampler2D litDetailMap;\nuniform vec2 litDetailScale;\n";
    patch.afterMap +=
      "diffuseColor.rgb = pow(max(pow(diffuseColor.rgb, vec3(1.0 / 2.2)) + texture2D(litDetailMap, vMapUv * litDetailScale).rgb - 0.5, 0.0), vec3(2.2));\n";
  }

  if (light.kind === "lightmap") {
    // lmap*.hlsl with an unperturbed normal: coefficient 0 plus the sun where it is visible.
    uniforms.litLightmap = { value: light.lightmap };
    uniforms.litSunVisibility = { value: light.sunVisibility };
    uniforms.litLightmapScale = { value: light.scale };
    patch.vertexHead +=
      "varying vec3 vLitNormal;\nvarying vec2 vLitUv;\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\n";
    patch.vertex += `${NORMAL_VERTEX}vLitUv = uv1;\n`;
    patch.fragmentHead +=
      "uniform vec3 litSunColor, litSunDirection;\nuniform sampler2D litLightmap, litSunVisibility;\nuniform float litLightmapScale;\nvarying vec3 vLitNormal;\nvarying vec2 vLitUv;\n";
    patch.afterColor += `{\nvec3 n = normalize(vLitNormal);\nvec3 light = texture2D(litLightmap, vLitUv).rgb * litLightmapScale + texture2D(litSunVisibility, vLitUv).r * ${SUN};\n${APPLY_LIGHT}}\n`;
  }
  if (light.kind === "probe") {
    const { colors, sunVisibility } = light.probe;
    uniforms.litProbe = {
      value: Array.from({ length: 8 }, (_, corner) =>
        new Vector3(
          colors[corner * 3],
          colors[corner * 3 + 1],
          colors[corner * 3 + 2],
        ).divideScalar(255),
      ),
    };
    uniforms.litProbeSun = { value: sunVisibility / 255 };
    uniforms.litProbeBasis = { value: PROBE_BASIS_MATRIX };
    patch.vertexHead += "varying vec3 vLitNormal;\n";
    patch.vertex += NORMAL_VERTEX;
    patch.fragmentHead +=
      "uniform vec3 litSunColor, litSunDirection;\nuniform vec3 litProbe[8];\nuniform float litProbeSun;\nuniform mat3 litProbeBasis;\nvarying vec3 vLitNormal;\n";
    patch.afterColor += `{\nvec3 n = normalize(vLitNormal);\n${PROBE_GLSL}${APPLY_LIGHT}}\n`;
  }
  if (light.kind === "ambient") {
    const ambient = ambientLight(light.probe, lighting.sunColor.toArray());
    uniforms.litAmbient = {
      value: new Vector3(...ambient.map((value) => Math.max(value, 0) ** 2.2)),
    };
    patch.fragmentHead += "uniform vec3 litAmbient;\n";
    patch.afterColor += "diffuseColor.rgb *= litAmbient;\n";
  }

  if (surface?.blend === "add") {
    Object.assign(material, { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor });
  }
  if (surface?.blend === "multiply") {
    // mul.hlsl: framebuffer × lerp(1, colour, vertex alpha).
    Object.assign(material, {
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
    });
    patch.afterColor +=
      "#ifdef USE_COLOR_ALPHA\ndiffuseColor = vec4(mix(vec3(1.0), diffuseColor.rgb, vColor.a), 1.0);\n#endif\n";
  }
  if (surface?.alphaTest === "lt128") {
    patch.alphaTest = "if (diffuseColor.a >= alphaTest) discard;\n";
  }

  if (!Object.values(patch).some(Boolean)) return material;
  const key = Object.values(patch).join("|");
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      patch.vertexHead +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${patch.vertex}`,
      );
    shader.fragmentShader =
      patch.fragmentHead +
      shader.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>\n${patch.afterMap}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${patch.afterColor}`)
        .replace(
          "#include <alphatest_fragment>",
          patch.alphaTest || "#include <alphatest_fragment>",
        );
  };
  // The generated code tells programs apart; uniforms differ per material.
  material.customProgramCacheKey = () => key;
  return material;
}

function surfaceOf(material: Material): LegacySurface | null {
  const extensions: unknown = material.userData.gltfExtensions;
  return isRecord(extensions) ? parseLegacySurface(extensions[SURFACE_EXTENSION]) : null;
}

/** The lightProbe and sunVisibility extras of the nearest model placement node. */
function probeOf(object: Object3D | null): LightProbe | null {
  for (let current = object; current; current = current.parent) {
    const colors: unknown = current.userData.lightProbe;
    if (colors === undefined) continue;
    const sunVisibility: unknown = current.userData.sunVisibility;
    if (!isNumbers(colors, 24)) return null;
    return { colors, sunVisibility: typeof sunVisibility === "number" ? sunVisibility : 0 };
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The texture index of a glTF textureInfo. */
export function textureIndex(value: unknown): number | null {
  return isRecord(value) && Number.isInteger(value.index) && (value.index as number) >= 0
    ? (value.index as number)
    : null;
}

function isNumbers(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return options.find((option) => option === value) ?? null;
}
