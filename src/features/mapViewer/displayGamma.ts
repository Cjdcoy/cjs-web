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

// A hot-reloaded module must not patch the shared chunks twice.
if (!ShaderChunk.colorspace_fragment.includes(GAMMA)) {
  ShaderChunk.colorspace_pars_fragment +=
    "\n#ifndef TONE_MAPPING\nuniform float toneMappingExposure;\n#endif\n";
  ShaderChunk.colorspace_fragment += `\n${GAMMA}\n`;
}
