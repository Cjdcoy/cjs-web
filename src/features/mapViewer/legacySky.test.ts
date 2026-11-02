import { DoubleSide, FrontSide, MeshStandardMaterial, ShaderMaterial, Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { loadMaterialSkies, parseLegacySky } from "./legacySky";

const facesFrom = (first: number) =>
  [0, 1, 2, 3, 4, 5].map((offset) => ({ index: first + offset, texCoord: 0 }));

describe("parseLegacySky", () => {
  const faces = facesFrom(40);

  it("reads the six cube faces in order", () => {
    expect(
      parseLegacySky({
        MAPCONV_legacy_sky: { material: "cod2:materials/sky_toujane", faces },
      }),
    ).toEqual([40, 41, 42, 43, 44, 45]);
  });

  it("reads a sky material's own extension next to its surface", () => {
    expect(
      parseLegacySky({
        MAPCONV_legacy_surface: { lighting: "lit", techniqueSet: "sky" },
        MAPCONV_legacy_sky: { material: "cod2:materials/nebula4red", faces },
      }),
    ).toEqual([40, 41, 42, 43, 44, 45]);
  });

  it("ignores a missing or malformed sky", () => {
    expect(parseLegacySky(undefined)).toBeNull();
    expect(parseLegacySky({})).toBeNull();
    expect(parseLegacySky({ MAPCONV_legacy_sky: { faces: faces.slice(1) } })).toBeNull();
    expect(
      parseLegacySky({ MAPCONV_legacy_sky: { faces: [...faces.slice(1), { index: -1 }] } }),
    ).toBeNull();
  });
});

describe("loadMaterialSkies", () => {
  const skyExtensions = (first: number) => ({
    MAPCONV_legacy_surface: { lighting: "lit", techniqueSet: "sky" },
    MAPCONV_legacy_sky: { material: `cod2:materials/sky${first}`, faces: facesFrom(first) },
  });
  // Faces 100–105 fail to load.
  const definitions = [
    { extensions: skyExtensions(0) },
    { extensions: skyExtensions(0) },
    { extensions: skyExtensions(6) },
    { extensions: skyExtensions(100) },
    { extensions: { MAPCONV_legacy_surface: { lighting: "lit" } } },
    {},
  ];
  const gltf = {
    parser: {
      json: { materials: definitions },
      getDependency: (type: string, index: number) =>
        type === "texture" && index < 100
          ? Promise.resolve(new Texture({ index }))
          : Promise.reject(new Error("missing")),
    },
  } as unknown as GLTF;
  // GLTFLoader keeps unknown material extensions in userData.gltfExtensions.
  const sources = definitions.map((definition, index) => {
    const material = new MeshStandardMaterial({ side: index === 1 ? DoubleSide : FrontSide });
    material.userData.gltfExtensions = definition.extensions;
    return material;
  });

  it("draws each sky material with one cube per distinct face set", async () => {
    const skies = await loadMaterialSkies(gltf);
    const [red, redAgain, blue] = sources.slice(0, 3).map((source) => skies.material(source));
    const cube = (material: unknown) => (material as ShaderMaterial).uniforms.skyCube.value;
    expect(red).toBeInstanceOf(ShaderMaterial);
    expect(skies.material(sources[0])).toBe(red);
    expect(cube(redAgain)).toBe(cube(red));
    expect(cube(blue)).not.toBe(cube(red));
    expect(cube(red).images).toEqual([0, 1, 2, 3, 4, 5].map((index) => ({ index })));
    expect([red?.side, redAgain?.side]).toEqual([FrontSide, DoubleSide]);
    expect((red as ShaderMaterial).fog).toBe(false);
    expect((red as ShaderMaterial).lights).toBe(false);
  });

  it("leaves other materials and skies that fail to load to the surface materials", async () => {
    const skies = await loadMaterialSkies(gltf);
    expect(sources.slice(3).map((source) => skies.material(source))).toEqual([null, null, null]);
  });

  it("finds no sky in a map without material skies", async () => {
    const skies = await loadMaterialSkies({ parser: { json: {} } } as unknown as GLTF);
    expect(skies.material(sources[0])).toBeNull();
  });
});
