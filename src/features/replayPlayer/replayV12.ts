import type { ReplayMarker, ReplayMeta, ReplaySamples, ReplaySkip } from "../../lib/api";

/*
 * J4L replay format v12 (jump4life docs/replay_format.md, "v12 per-usercmd blocks"): one frame per
 * usercmd, in CRC-checked blocks. scanV12 and decodeV12Block read the bytes exactly like the native
 * codec (libcod2 replay_v12.hpp); v12Samples maps the frames to ReplaySamples like native playback's
 * replayCacheGetSample, so the web and in-game views agree.
 */

const HEADER_BYTES = 46;
const MIN_BODY = 48;
const MAX_BODY = 1 << 20;
const MAX_BLOCK_FRAMES = 512;

const MARKER_STRUCT = 1;
const MARKER_CHECKPOINT = 2;
const MARKER_FPS = 3;
const MARKER_GRENADE = 4;
const MARKER_RESUME = 5;

/** usercmd press bits (input_mask attack, jump, frag, use, melee, reload) kept across dropped frames. */
const PRESS_BITS = 1 | 2 | 4 | 8 | 16 | 512;
/** frame.state bits. */
const STATE_GROUND = 1;
const STATE_CROUCH = 2;
const STATE_PRONE = 4;
const STATE_LADDER = 8;
const STATE_MANTLE = 16;

/**
 * Frames kept in memory. A longer replay keeps every k-th frame plus the last; at 333 fps this is
 * about 100 minutes at full rate.
 */
export const MAX_FRAMES = 2_000_000;

/** j4l_replay_skip_same_save_radius (default 20 units) in origin*256 space, as the API's Decode. */
const SAME_SAVE_RADIUS_256 = 20 * 256;

export interface V12Block {
  /** Byte offset of the block's length field. */
  offset: number;
  body_len: number;
  start_ms: number;
  frame_count: number;
  flags: number;
  fps: number;
}

export interface V12Marker {
  block: number;
  kind: number;
  frame: number;
  ms: number;
  mask?: number;
  ox?: number;
  oy?: number;
  oz?: number;
  cp_id?: number;
  time_played?: number;
  fps?: number;
}

/** One block's frames, column-wise. `mark` bits: 1 save, 2 load, 4 finish, 8 grenade, 16 resume. */
export interface V12Frames {
  ms: Float64Array;
  ox: Float64Array;
  oy: Float64Array;
  oz: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  pitch: Float64Array;
  yaw: Float64Array;
  buttons: Float64Array;
  forwardmove: Float64Array;
  rightmove: Float64Array;
  state: Float64Array;
  health: Float64Array;
  aux: Float64Array;
  mark: Float64Array;
  fps: Float64Array;
}

export function createV12Frames(): V12Frames {
  const column = () => new Float64Array(MAX_BLOCK_FRAMES);
  return {
    ms: column(),
    ox: column(),
    oy: column(),
    oz: column(),
    vx: column(),
    vy: column(),
    vz: column(),
    pitch: column(),
    yaw: column(),
    buttons: column(),
    forwardmove: column(),
    rightmove: column(),
    state: column(),
    health: column(),
    aux: column(),
    mark: column(),
    fps: column(),
  };
}

/** A J4LB replay file whose version byte is not 12. */
export class ReplayVersionError extends Error {}

/**
 * File header and the CRC-valid blocks. Like native playback, the walk ends at the first torn,
 * oversized or CRC-failing block. Throws ReplayVersionError for another J4LB version and Error
 * when the bytes are not a replay file.
 */
export function scanV12(bytes: Uint8Array): { tick_ms: number; blocks: V12Block[] } {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== "J4LB") {
    throw new Error("The bytes are not a J4L replay file");
  }
  if (bytes[4] !== 12) throw new ReplayVersionError(`Replay format ${bytes[4]} is not v12`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks: V12Block[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const body = offset + 4;
    if (length < MIN_BODY || length > MAX_BODY || body + length + 4 > bytes.length) break;
    if (view.getUint32(body + length) !== crc32(bytes, body, body + length)) break;
    const frameCount = view.getUint16(body + 4);
    if (frameCount < 1 || frameCount > MAX_BLOCK_FRAMES) break;
    blocks.push({
      offset,
      body_len: length,
      start_ms: view.getUint32(body),
      frame_count: frameCount,
      flags: bytes[body + 6],
      fps: view.getUint16(body + 44),
    });
    offset = body + length + 4;
  }
  // In-game replay_tick_ms falls back to 100 like the API's Decode.
  return { tick_ms: view.getUint16(5) || 100, blocks };
}

const malformed = new Error("Malformed v12 block");

/**
 * Decodes a scanned block into `frames` (entries 0..frame_count-1) and returns its markers, or null
 * when the body is malformed (playback then ends at the previous block).
 */
export function decodeV12Block(
  bytes: Uint8Array,
  block: V12Block,
  index: number,
  frames: V12Frames,
): V12Marker[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = block.offset + 4;
  const end = start + block.body_len;
  const n = block.frame_count;
  const { ms, ox, oy, oz, vx, vy, vz, pitch, yaw, buttons, forwardmove, rightmove } = frames;
  const { state, health, aux, mark, fps } = frames;

  ms[0] = view.getInt32(start);
  state[0] = bytes[start + 7];
  ox[0] = view.getInt32(start + 8);
  oy[0] = view.getInt32(start + 12);
  oz[0] = view.getInt32(start + 16);
  vx[0] = view.getInt32(start + 20);
  vy[0] = view.getInt32(start + 24);
  vz[0] = view.getInt32(start + 28);
  pitch[0] = view.getUint16(start + 32);
  yaw[0] = view.getUint16(start + 34);
  buttons[0] = view.getUint32(start + 36);
  forwardmove[0] = view.getInt8(start + 40);
  rightmove[0] = view.getInt8(start + 41);
  health[0] = bytes[start + 42];
  aux[0] = bytes[start + 43];
  fps[0] = view.getUint16(start + 44);

  let p = start + HEADER_BYTES;
  const markers: V12Marker[] = [];
  if (p + 2 > end) return null;
  const markerCount = view.getUint16(p);
  p += 2;
  let lastFrame = 0;
  for (let m = 0; m < markerCount; m += 1) {
    if (p + 8 > end) return null;
    const kind = bytes[p];
    const payload = bytes[p + 1];
    const frame = view.getUint16(p + 2);
    const marker: V12Marker = { block: index, kind, frame, ms: view.getUint32(p + 4) };
    p += 8;
    if (frame >= n || frame < lastFrame || p + payload > end) return null;
    lastFrame = frame;
    if (kind === MARKER_STRUCT) {
      if (payload < 13) return null;
      marker.mask = bytes[p];
      marker.ox = view.getInt32(p + 1);
      marker.oy = view.getInt32(p + 5);
      marker.oz = view.getInt32(p + 9);
    } else if (kind === MARKER_CHECKPOINT) {
      if (payload < 8) return null;
      marker.cp_id = view.getInt32(p);
      marker.time_played = view.getInt32(p + 4);
    } else if (kind === MARKER_FPS) {
      if (payload < 2) return null;
      marker.fps = view.getUint16(p);
    }
    p += payload;
    markers.push(marker);
  }

  // Zigzag LEB128; the values stay far below 2^53, so plain arithmetic is exact.
  const varint = (): number => {
    let value = 0;
    let scale = 1;
    for (let shift = 0; shift < 64 && p < end; shift += 7) {
      const byte = bytes[p];
      p += 1;
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
      scale *= 128;
    }
    throw malformed;
  };

  try {
    for (let k = 1; k < n; k += 1) ms[k] = (ms[k - 1] + varint()) | 0;
    for (const angle of [pitch, yaw]) {
      let delta = 0;
      for (let k = 1; k < n; k += 1) {
        delta += varint();
        angle[k] = (angle[k - 1] + delta) & 0xffff;
      }
    }
    for (const velocity of [vx, vy, vz]) {
      let delta = 0;
      for (let k = 1; k < n; k += 1) {
        delta += varint();
        velocity[k] = (velocity[k - 1] + delta) | 0;
      }
    }
    for (const [origin, velocity] of [
      [ox, vx],
      [oy, vy],
      [oz, vz],
    ]) {
      for (let k = 1; k < n; k += 1) {
        // (v0 + v1) * dt * 128 < 2^53 (recorder limits), so the quotient truncates exactly.
        const moved = ((velocity[k - 1] + velocity[k]) * (ms[k] - ms[k - 1]) * 128) / 1000;
        origin[k] = (origin[k - 1] + Math.trunc(moved) + varint()) | 0;
      }
    }
    if (p + n - 1 > end) return null;
    const changes = p - 1; // bytes[changes + k] is frame k's change byte
    p += n - 1;
    const fields = [buttons, forwardmove, rightmove, state, health, aux];
    for (let bit = 0; bit < fields.length; bit += 1) {
      const column = fields[bit];
      for (let k = 1; k < n; k += 1) {
        if ((bytes[changes + k] & (1 << bit)) === 0) {
          column[k] = column[k - 1];
          continue;
        }
        const value = varint();
        column[k] = bit === 0 ? value >>> 0 : bit <= 2 ? (value << 24) >> 24 : value & 0xff;
      }
    }
  } catch (error) {
    if (error === malformed) return null;
    throw error;
  }
  if (p !== end) return null;

  let next = 0;
  for (let k = 0; k < n; k += 1) {
    if (k > 0) fps[k] = fps[k - 1];
    mark[k] = 0;
    for (; next < markers.length && markers[next].frame === k; next += 1) {
      const marker = markers[next];
      if (marker.kind === MARKER_STRUCT) mark[k] |= (marker.mask ?? 0) & 7;
      else if (marker.kind === MARKER_GRENADE) mark[k] |= 8;
      else if (marker.kind === MARKER_RESUME) mark[k] |= 16;
      else if (marker.kind === MARKER_FPS) fps[k] = marker.fps ?? 0;
    }
  }
  return markers;
}

/**
 * Maps a v12 file to ReplaySamples as replayCacheGetSample shows it in-game: t from the first frame,
 * origin / 256, angles from the 16-bit shorts in hundredths of a degree, input_mask, flags, stance
 * and aux derived from the usercmd and state. Markers keep their frame's exact time; an fps marker
 * marks every FPS change (the first frame's included), and the skip plan is the API Decode's, built
 * from the save/load origins. Above `maxFrames` frames only every k-th frame and the last are kept,
 * with the press bits of the dropped frames OR-ed into the next kept one.
 */
export function v12Samples(
  bytes: Uint8Array,
  meta: ReplayMeta,
  maxFrames = MAX_FRAMES,
): ReplaySamples {
  const { tick_ms, blocks } = scanV12(bytes);
  const total = blocks.reduce((sum, block) => sum + block.frame_count, 0);
  const step = Math.max(1, Math.ceil(total / maxFrames));
  const capacity = Math.ceil(total / step) + 1;
  const t = new Float64Array(capacity);
  const pos = new Float32Array(capacity * 3);
  const ang = new Float32Array(capacity * 3);
  const vel = new Float32Array(capacity * 3);
  const stance = new Uint8Array(capacity);
  const flags = new Uint8Array(capacity);
  const aux = new Uint8Array(capacity);
  const input = new Uint32Array(capacity);
  const markers: ReplayMarker[] = [];
  const frames = createV12Frames();

  let finished = meta.finished;
  let frame = 0;
  let written = 0;
  let press = 0;
  let firstMs = 0;
  let currentFps = -1;
  // Decode's skip plan, by 1-based frame number like native playback.
  const windows: { start: number; startT: number; target: number; targetT: number }[] = [];
  const loads: number[] = [];
  let lastLoad = 0;
  let lastLoadT = 0;
  let lastProgress = 1;
  let lastProgressT = 0;
  let loadX = 0;
  let loadY = 0;
  let loadZ = 0;
  const closeWindow = (number: number, time: number) => {
    if (lastLoad >= 1) {
      windows.push({
        start: lastProgress,
        startT: lastProgressT,
        target: lastLoad,
        targetT: lastLoadT,
      });
    }
    lastProgress = number;
    lastProgressT = time;
    lastLoad = 0;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const raw = decodeV12Block(bytes, blocks[index], index, frames);
    if (!raw) break;
    if (index === 0) firstMs = frames.ms[0];
    let next = 0;
    for (let k = 0; k < blocks[index].frame_count; k += 1, frame += 1) {
      const time = frames.ms[k] - firstMs;
      const fps = frames.fps[k];
      if (fps !== currentFps) {
        markers.push(fps > 0 ? { t: time, kind: "fps", fps } : { t: time, kind: "fps" });
        currentFps = fps;
      }
      for (; next < raw.length && raw[next].frame === k; next += 1) {
        const marker = raw[next];
        if (marker.kind === MARKER_CHECKPOINT) {
          markers.push({ t: time, kind: "checkpoint", cp_id: marker.cp_id ?? 0 });
          continue;
        }
        if (marker.kind !== MARKER_STRUCT) continue;
        const mask = marker.mask ?? 0;
        const number = frame + 1;
        if (mask & 1) markers.push({ t: time, kind: "save" });
        if (mask & 2) markers.push({ t: time, kind: "load" });
        if (mask & 4) {
          markers.push({ t: time, kind: "finish" });
          finished = true;
          closeWindow(number, time);
        }
        if (mask & 2) {
          lastLoad = number;
          lastLoadT = time;
          [loadX, loadY, loadZ] = [marker.ox ?? 0, marker.oy ?? 0, marker.oz ?? 0];
          loads.push(number);
        }
        if (mask & 1) {
          const dx = (marker.ox ?? 0) - loadX;
          const dy = (marker.oy ?? 0) - loadY;
          const dz = (marker.oz ?? 0) - loadZ;
          const far = dx * dx + dy * dy + dz * dz > SAME_SAVE_RADIUS_256 ** 2;
          if (lastLoad < 1 || far) closeWindow(number, time);
        }
      }

      const state = frames.state[k];
      const mask = inputMask(frames.buttons[k], frames.forwardmove[k], frames.rightmove[k], state);
      const held = mask | press;
      // A dropped frame is written to the next free slot too, so the last frame is there to keep.
      const slot = frame % step === 0 ? written++ : written;
      press = slot < written ? 0 : held & PRESS_BITS;
      const code = held & 16384 ? 2 : held & 8192 ? 1 : 0;
      t[slot] = time;
      pos[slot * 3] = frames.ox[k] / 256;
      pos[slot * 3 + 1] = frames.oy[k] / 256;
      pos[slot * 3 + 2] = frames.oz[k] / 256;
      ang[slot * 3] = angle100(frames.pitch[k]) / 100;
      ang[slot * 3 + 1] = angle100(frames.yaw[k]) / 100;
      vel[slot * 3] = frames.vx[k];
      vel[slot * 3 + 1] = frames.vy[k];
      vel[slot * 3 + 2] = frames.vz[k];
      stance[slot] = code;
      flags[slot] =
        (code ? 1 : 0) |
        (held & 1 ? 2 : 0) |
        (held & 32768 ? 4 : 0) |
        (held & 16 ? 8 : 0) |
        (held & 8 ? 16 : 0);
      input[slot] = held;
      aux[slot] =
        (frames.aux[k] & ~1) | (state & STATE_LADDER ? 1 : 0) | (state & STATE_MANTLE ? 8 : 0);
    }
  }
  if (frame > 0 && (frame - 1) % step !== 0) written += 1;

  const skips: ReplaySkip[] = windows.map((window) => ({
    start_t: window.startT,
    target_t: window.targetT,
    fails: loads.filter((load) => load > window.start && load <= window.target).length,
  }));
  return {
    run_id: meta.run_id,
    mapname: meta.mapname,
    player_id: meta.player_id,
    playername: meta.playername,
    format_version: 12,
    tick_ms,
    duration_ms: written > 0 ? t[written - 1] : 0,
    finished,
    t: t.subarray(0, written),
    pos: pos.subarray(0, written * 3),
    ang: ang.subarray(0, written * 3),
    vel: vel.subarray(0, written * 3),
    stance: stance.subarray(0, written),
    markers,
    flags: flags.subarray(0, written),
    input: input.subarray(0, written),
    aux: aux.subarray(0, written),
    run_fps: meta.run_fps,
    skips,
  };
}

/** build_input_mask() bits from the usercmd (j4l_rpl12_input_mask). */
function inputMask(buttons: number, forward: number, right: number, state: number): number {
  let mask = 0;
  if (buttons & 0x1) mask |= 1;
  if (buttons & 0x400) mask |= 2;
  if (buttons & 0x10000) mask |= 4;
  if (buttons & 0x28) mask |= 8; // USE or USERELOAD (approximate)
  if (buttons & 0x4) mask |= 16;
  if (forward === 127) mask |= 32;
  if (forward === -127) mask |= 64;
  if (right === -127) mask |= 128;
  if (right === 127) mask |= 256;
  if (buttons & 0x10) mask |= 512;
  if (buttons & 0x1000) mask |= 1024;
  if (buttons & 0x40) mask |= 2048;
  if (buttons & 0x80) mask |= 4096;
  if (state & STATE_PRONE) mask |= 16384;
  else if (state & STATE_CROUCH) mask |= 8192;
  if (!(state & STATE_GROUND)) mask |= 32768;
  return mask;
}

/** ANGLE2SHORT value to hundredths of a degree in (-18000, 18000] (j4l_rpl12_angle100). */
function angle100(short: number): number {
  const value = Math.floor((short * 36000 + 32768) / 65536);
  return value > 18000 ? value - 36000 : value;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let c = index;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[index] = c;
  }
  return table;
})();

/** CRC-32 (IEEE, zlib's crc32) of bytes[start..end). */
function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = -1;
  for (let index = start; index < end; index += 1) {
    c = CRC_TABLE[(c ^ bytes[index]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}
