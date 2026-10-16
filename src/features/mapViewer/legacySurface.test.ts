import {
  BufferGeometry,
  CustomBlending,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  ShaderLib,
  Texture,
  Vector3,
  type Material,
} from "three";
import { describe, expect, it } from "vitest";
import {
  ambientLight,
  codToSceneDirection,
  createSurfaceMaterials,
  parseLegacySurface,
  probeLight,
  surfaceLight,
  type SurfaceLighting,
} from "./legacySurface";

// Directions 0..7 get distinct colours: corner k is (10k, 10k + 1, 10k + 2).
const PROBE = Array.from({ length: 24 }, (_, index) => Math.floor(index / 3) * 10 + (index % 3));
const corner = (k: number) => [10 * k, 10 * k + 1, 10 * k + 2].map((value) => value / 255);

describe("CoD directions", () => {
  it("turns Z-up CoD directions into Y-up scene directions and back", () => {
    expect(codToSceneDirection([1, 2, 3])).toEqual([1, 3, -2]);
    // The extension's N_cod = (n.x, −n.z, n.y) undoes it.
    const [x, y, z] = codToSceneDirection([1, 2, 3]);
    expect([x, -z, y]).toEqual([1, 2, 3]);
  });
});

describe("light probes", () => {
  const expectLight = (actual: number[], expected: number[]) =>
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));

  it("picks direction 7 for CoD up and direction 0 for CoD down", () => {
    expectLight(probeLight(PROBE, codToSceneDirection([0, 0, 1])), corner(7));
    expectLight(probeLight(PROBE, codToSceneDirection([0, 0, -1])), corner(0));
  });

  it("mixes the four x corners along the first basis axis", () => {
    const axis = codToSceneDirection([0.81649658, 0, 0.57735027]);
    // Corners 1, 3, 5 and 7 have red 10, 30, 50 and 70.
    const mean = [40 / 255, 41 / 255, 42 / 255];
    expectLight(probeLight(PROBE, axis), mean);
  });

  it("keeps a uniform probe uniform for any normal", () => {
    const grey = Array.from({ length: 24 }, () => 51);
    const normal = new Vector3(0.3, -0.5, 0.8).normalize().toArray();
    expectLight(probeLight(grey, normal), [0.2, 0.2, 0.2]);
  });

  it("averages the probe and adds the visible sun for ambient surfaces", () => {
    // Channel means over the 8 corners: 35, 36 and 37.
    const mean = [35 / 255, 36 / 255, 37 / 255];
    expectLight(ambientLight({ colors: PROBE, sunVisibility: 255 }, [0.5, 0, 0]), [
      mean[0] + 0.5,
      mean[1],
      mean[2],
    ]);
    expectLight(ambientLight({ colors: PROBE, sunVisibility: 51 }, [0.5, 0, 0]), [
      mean[0] + 0.1,
      mean[1],
      mean[2],
    ]);
  });
});

describe("parseLegacySurface", () => {
  it("reads the documented extension", () => {
    expect(
      parseLegacySurface({
        techniqueSet: "phong_replace_detail",
        lighting: "lit",
        alphaTest: "ge128",
        blend: "add",
        detailMap: { index: 1, texCoord: 0 },
        detailScale: [8, 4],
        lightmap: { index: 2, texCoord: 1 },
        lightmapSun: { index: 3, texCoord: 1 },
      }),
    ).toEqual({
      lighting: "lit",
      alphaTest: "ge128",
      blend: "add",
      detail: { texture: 1, scale: [8, 4] },
      lightmap: { texture: 2, sun: 3, scale: 1 },
    });
  });

  it("reads lightmapScale, defaulting to 1", () => {
    const surface = (lightmapScale?: unknown) =>
      parseLegacySurface({
        lighting: "lit",
        lightmap: { index: 2, texCoord: 1 },
        lightmapSun: { index: 3, texCoord: 1 },
        lightmapScale,
      });
    expect(surface(2)?.lightmap?.scale).toBe(2);
    expect(surface()?.lightmap?.scale).toBe(1);
  });

  it("drops malformed parts and rejects a surface without lighting", () => {
    expect(
      parseLegacySurface({
        lighting: "ambient",
        alphaTest: "always",
        blend: "screen",
        detailMap: { index: 1 },
        lightmap: { index: 2 },
      }),
    ).toEqual({ lighting: "ambient", alphaTest: null, blend: null, detail: null, lightmap: null });
    expect(parseLegacySurface({ lighting: "glow" })).toBeNull();
    expect(parseLegacySurface(null)).toBeNull();
  });
});

describe("surface lighting", () => {
  const lightmap = new Texture();
  const sunVisibility = new Texture();
  const lighting: SurfaceLighting = {
    sunColor: new Vector3(0.5, 0.5, 0.5),
    sunDirection: new Vector3(0, 1, 0),
    textures: new Map([
      [2, lightmap],
      [3, sunVisibility],
    ]),
  };

  const surfaceMaterial = (surface: object) => {
    const material = new MeshStandardMaterial();
    material.userData.gltfExtensions = { MAPCONV_legacy_surface: surface };
    return material;
  };
  const mesh = (material: Material, options: { uv1?: boolean; probe?: boolean } = {}) => {
    const geometry = new BufferGeometry();
    if (options.uv1) geometry.setAttribute("uv1", new Float32BufferAttribute([0, 0], 2));
    const result = new Mesh(geometry, material);
    if (options.probe) {
      const placement = new Group();
      placement.userData = { lightProbe: PROBE, sunVisibility: 128 };
      placement.add(result);
    }
    return result;
  };
  const lit = { lighting: "lit", lightmap: { index: 2 }, lightmapSun: { index: 3 } };

  it("follows the extension's lighting table", () => {
    expect(surfaceLight(mesh(surfaceMaterial(lit), { uv1: true }), lighting)).toEqual({
      kind: "lightmap",
      lightmap,
      sunVisibility,
      scale: 1,
    });
    const probe = { colors: PROBE, sunVisibility: 128 };
    expect(surfaceLight(mesh(surfaceMaterial(lit), { probe: true }), lighting)).toEqual({
      kind: "probe",
      probe,
    });
    expect(
      surfaceLight(mesh(surfaceMaterial({ lighting: "ambient" }), { probe: true }), lighting),
    ).toEqual({ kind: "ambient", probe });
    expect(surfaceLight(mesh(surfaceMaterial(lit)), lighting)).toEqual({ kind: "none" });
    expect(
      surfaceLight(mesh(surfaceMaterial({ lighting: "unlit" }), { probe: true }), lighting),
    ).toEqual({ kind: "none" });
  });

  it("lights fallback colours by the probe or the scene, and keeps glTF unlit materials", () => {
    expect(surfaceLight(mesh(new MeshStandardMaterial(), { probe: true }), lighting).kind).toBe(
      "probe",
    );
    expect(surfaceLight(mesh(new MeshStandardMaterial()), lighting).kind).toBe("scene");
    expect(surfaceLight(mesh(new MeshBasicMaterial(), { probe: true }), lighting).kind).toBe(
      "none",
    );
  });

  it("builds shared, patched materials", () => {
    const surfaces = createSurfaceMaterials(lighting);
    const source = surfaceMaterial({ ...lit, alphaTest: "gt0", blend: "add" });
    const first = surfaces.material(mesh(source, { uv1: true }));
    expect(surfaces.material(mesh(source, { uv1: true }))).toBe(first);
    expect(first).toBeInstanceOf(MeshBasicMaterial);
    expect(first.alphaTest).toBeCloseTo(0.5 / 255);
    expect(first.blending).toBe(CustomBlending);
    expect(surfaces.material(mesh(new MeshStandardMaterial()))).toBeInstanceOf(MeshLambertMaterial);

    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.basic.vertexShader,
      fragmentShader: ShaderLib.basic.fragmentShader,
    } as unknown as Parameters<Material["onBeforeCompile"]>[0];
    first.onBeforeCompile(shader, undefined as never);
    expect(shader.vertexShader).toContain("vLitUv = uv1;");
    expect(shader.fragmentShader).toContain("texture2D(litLightmap, vLitUv)");
    expect(shader.uniforms.litLightmap.value).toBe(lightmap);
  });

  it("inverts the alpha test for lt128 and probes per pixel", () => {
    const surfaces = createSurfaceMaterials(lighting);
    const material = surfaces.material(
      mesh(surfaceMaterial({ lighting: "lit", alphaTest: "lt128" }), { probe: true }),
    );
    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.basic.vertexShader,
      fragmentShader: ShaderLib.basic.fragmentShader,
    } as unknown as Parameters<Material["onBeforeCompile"]>[0];
    material.onBeforeCompile(shader, undefined as never);
    expect(shader.fragmentShader).toContain("if (diffuseColor.a >= alphaTest) discard;");
    expect(shader.fragmentShader).not.toContain("#include <alphatest_fragment>");
    expect(shader.fragmentShader).toContain("vec3 p = n * litProbeBasis;");
    expect(shader.uniforms.litProbe.value).toHaveLength(8);
  });
});
