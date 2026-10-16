import { describe, expect, it } from "vitest";
import { parseLegacySky } from "./legacySky";

describe("parseLegacySky", () => {
  const faces = [40, 41, 42, 43, 44, 45].map((index) => ({ index, texCoord: 0 }));

  it("reads the six cube faces in order", () => {
    expect(
      parseLegacySky({
        MAPCONV_legacy_sky: { material: "cod2:materials/sky_toujane", faces },
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
