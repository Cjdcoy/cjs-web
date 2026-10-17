import { ShaderChunk } from "three";
import { describe, expect, it, vi } from "vitest";

describe("display gamma", () => {
  it("raises every shader's encoded output to 1 / toneMappingExposure, once", async () => {
    await import("./displayGamma");
    vi.resetModules();
    await import("./displayGamma");

    // Gamma 1 is an exact identity: the pow is skipped.
    expect(ShaderChunk.colorspace_fragment.match(/gl_FragColor\.rgb = pow/g)).toHaveLength(1);
    expect(ShaderChunk.colorspace_fragment).toMatch(
      /linearToOutputTexel[\s\S]*if \(toneMappingExposure != 1\.0\) gl_FragColor\.rgb = pow\(max\(gl_FragColor\.rgb, 0\.0\), vec3\(1\.0 \/ toneMappingExposure\)\)/,
    );
    // Declared only where tone mapping does not already declare it.
    expect(ShaderChunk.colorspace_pars_fragment).toContain(
      "#ifndef TONE_MAPPING\nuniform float toneMappingExposure;\n#endif",
    );
  });

  it("stays idempotent when re-run with a changed GAMMA, as under HMR", async () => {
    const holder = ShaderChunk as typeof ShaderChunk & {
      __cjsGammaBase?: { pars: string; frag: string };
    };
    await import("./displayGamma");
    // Simulate an older module build that patched with a different GAMMA line.
    ShaderChunk.colorspace_fragment = `${holder.__cjsGammaBase?.frag ?? ""}\nOLD_GAMMA_LINE;\n`;
    vi.resetModules();
    await import("./displayGamma");
    vi.resetModules();
    await import("./displayGamma");

    expect(
      ShaderChunk.colorspace_pars_fragment.match(/uniform float toneMappingExposure;/g),
    ).toHaveLength(1);
    expect(ShaderChunk.colorspace_fragment).not.toContain("OLD_GAMMA_LINE");
    expect(ShaderChunk.colorspace_fragment.match(/gl_FragColor\.rgb = pow/g)).toHaveLength(1);
  });
});
