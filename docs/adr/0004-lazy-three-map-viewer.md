# ADR 0004: Lazy three.js map viewer and replay playback

- **Status:** accepted
- **Date:** 2026-10-16

## Context

The owner reprioritized 3D map views and Jump4Life replay playback, which were post-MVP. Maps are
converted offline into web-ready glTF binaries (meshopt geometry, WebP textures, no Draco or KTX2),
and the backend serves decoded replays at `GET /replay/samples`. Rendering either needs WebGL, a
glTF loader, and a meshopt decoder. Models are tens of megabytes and most visitors never open one.

## Decision

- Add `three`, exactly pinned (`0.186.1`), with `@types/three` as a development dependency. Use its
  `GLTFLoader`, `PointerLockControls`, and bundled `MeshoptDecoder`; no other 3D or decoder
  packages.
- Keep three.js behind one dynamic import (`src/features/mapViewer/MapViewerCanvas.tsx`) shared by
  the `/maps/:mapId/3d` and `/replays/:runId` routes. `scripts/check-performance.mjs` fails if that
  module stops being a dynamic entry or is imported statically, and gives it its own gzip budget,
  excluded from the route and total budgets: 170 KiB (164.1 KiB measured after CJS-072), 173 KiB
  with the animated viewmodel (CJS-075), 175 KiB with the third-person player (174.5 KiB, CJS-082).
- Gate every 3D entry point on the build-time `VITE_MAP_MODEL_BASE_URL`; models load from
  `${base}/${encodeURIComponent(mapname)}.glb`. Unset hides the map 3D link and every replay link.
  CI and deployment builds read the repository variable of the same name.
- Request replay samples from the replay API base as v2 JSON regardless of `VITE_API_FORMAT`: only
  v2 is compressed, and the positional MessagePack encoding does not suit the flat sample arrays.
- Fetch models with `fetch` and an `AbortController` to report download progress and cancel on
  navigation, then parse with `GLTFLoader.parseAsync`. Dispose geometry, materials, textures, the
  renderer, and its WebGL context on unmount.
- Interpolate replay playback on the client (cubic Hermite on position with velocity tangents,
  shortest-arc angles, snapping across loads and teleports) in a pure, unit-tested module.
- From the free camera, draw the runner as the CoD2 third-person player
  (`player/j4l_body_gunpyeong.glb`, loaded on first use), posed by a pure per-sample state machine
  in the replay feature (`replayBody.ts`, checkpointed so seeking equals playing) and lit from the
  lightmap below its feet plus the map's sun, like the game lights models from its light grid
  (CJS-082).
- Shade render materials from the converter's `MAPCONV_legacy_surface` extension (lightmaps, model
  light probes, detail maps, add and multiply blends, alpha tests) by patching three.js's unlit
  material, and draw the `MAPCONV_legacy_sky` cube as the scene background (CJS-072). Fallback
  colours without game light stay Lambert under the scene lights.
- Extend the Content Security Policy with `script-src 'wasm-unsafe-eval'` (the meshopt decoder
  compiles WebAssembly) and `blob:` in `connect-src` and `img-src` (GLB-embedded textures load
  through object URLs). `'wasm-unsafe-eval'` does not permit JavaScript `eval`.

## Consequences

Pages that never open a 3D view keep their existing initial bundle; the new routes, links, and
replay HUD, view modes (16:9, cinema, full screen), shortcut dialog, and the Web Audio replay sound
engine raise the route budget from 35 to 36 KiB, the total JavaScript budget from 136 to 151 KiB, and
total CSS from 20 to 22 KiB. Besides `<mapname>.glb`, the model host serves what replays load on
demand: `sounds/sounds.json` plus WAV files, the viewmodel `viewmodel/luger_mp2_anims.glb` and its
flash atlas `fx/exp_fireball_atlas.webp`, and the third-person player
`player/j4l_body_gunpyeong.glb`; it needs CORS for all of them, and `connect-src https:` already
allows the fetches. The replay HUD (angle helper, speed meter, FPS) is plain
DOM over the canvas; only the optional first-person weapon model adds a second WebGL pass. The model host must serve CORS headers and, in production, HTTPS. WebGL is
required; browsers without it get an explicit error state. Replay playback and the map view share
one renderer implementation, so lighting or material changes apply to both.
