import { ShaderChunk } from "three";

/**
 * CoD2's r_gamma: a hardware gamma ramp, output = input^(1 / gamma) on display values
 * (R_SetColorMappings). It runs here after the sRGB output encode of every built-in three.js
 * shader, so lit, unlit and fallback materials, collision overlays, the sky and the weapon all get
 * it, and unlike a multiply it lifts near-black without clipping highlights. The value travels in
 * `renderer.toneMappingExposure`, which three.js uploads to every program on each render; tone
 * mapping itself stays off, so nothing else reads it.
 */
// Gamma 1 skips the pow, which is not exact in GLSL, so neutral leaves every pixel unchanged.
const GAMMA =
  "if (toneMappingExposure != 1.0) gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(1.0 / toneMappingExposure));";

// HMR re-runs this module, so always rebuild from the pristine chunks, kept once on ShaderChunk.
const holder = ShaderChunk as typeof ShaderChunk & {
  __cjsGammaBase?: { pars: string; frag: string };
};
const base = (holder.__cjsGammaBase ??= {
  pars: ShaderChunk.colorspace_pars_fragment,
  frag: ShaderChunk.colorspace_fragment,
});
// three declares the uniform in tonemapping_pars_fragment only when TONE_MAPPING is defined.
ShaderChunk.colorspace_pars_fragment = `${base.pars}\n#ifndef TONE_MAPPING\nuniform float toneMappingExposure;\n#endif\n`;
ShaderChunk.colorspace_fragment = `${base.frag}\n${GAMMA}\n`;
