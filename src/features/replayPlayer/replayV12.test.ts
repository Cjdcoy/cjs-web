import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReplayMeta } from "../../lib/api";
import {
  ReplayVersionError,
  createV12Frames,
  decodeV12Block,
  scanV12,
  v12Samples,
  type V12Frames,
  type V12Marker,
} from "./replayV12";

const fixtures = resolve("src/features/replayPlayer/__fixtures__");
const bytes = new Uint8Array(readFileSync(resolve(fixtures, "replay_v12_golden.rpl")));
const golden = JSON.parse(readFileSync(resolve(fixtures, "replay_v12_golden.json"), "utf8")) as {
  tick_ms: number;
  frame_fields: (keyof V12Frames)[];
  blocks: unknown[];
  markers: V12Marker[];
  frames: number[][];
};
const meta: ReplayMeta = {
  run_id: 7001,
  mapname: "mp_cjs_training",
  player_id: 501,
  playername: "^2Runner",
  format_version: 12,
  finished: false,
  run_fps: 0,
};
const PRESS = 1 | 2 | 4 | 8 | 16 | 512;

function decodeAll(file: Uint8Array) {
  const { tick_ms, blocks } = scanV12(file);
  const frames = createV12Frames();
  const markers: V12Marker[] = [];
  const rows: number[][] = [];
  blocks.forEach((block, index) => {
    const decoded = decodeV12Block(file, block, index, frames);
    if (!decoded) throw new Error(`block ${index} failed`);
    markers.push(...decoded);
    for (let k = 0; k < block.frame_count; k += 1) {
      rows.push(golden.frame_fields.map((field) => frames[field][k]));
    }
  });
  return { tick_ms, blocks, markers, rows };
}

describe("v12 replay decoder", () => {
  it("reproduces the golden fixture: blocks, markers, and every frame", () => {
    const decoded = decodeAll(bytes);
    expect(decoded.tick_ms).toBe(golden.tick_ms);
    expect(decoded.blocks).toEqual(golden.blocks);
    expect(decoded.markers).toEqual(golden.markers);
    expect(decoded.rows).toEqual(golden.frames);
  });

  it("ends at the previous block on a CRC mismatch or a torn tail", () => {
    const { blocks } = scanV12(bytes);
    const corrupted = bytes.slice();
    corrupted[blocks[2].offset + 60] ^= 0xff;
    expect(scanV12(corrupted).blocks).toEqual(blocks.slice(0, 2));
    const torn = bytes.slice(0, blocks[4].offset + 20);
    expect(scanV12(torn).blocks).toEqual(blocks.slice(0, 4));
    expect(v12Samples(torn, meta).t.length).toBe(710);
    expect(() => scanV12(bytes.slice(0, 7))).toThrow(/not a J4L replay/);
    const v11 = bytes.slice();
    v11[4] = 11;
    expect(() => scanV12(v11)).toThrow(ReplayVersionError);
    const noTick = bytes.slice();
    noTick[5] = noTick[6] = 0;
    expect(scanV12(noTick).tick_ms).toBe(100);
  });

  it("maps frames to samples like in-game playback", () => {
    const samples = v12Samples(bytes, meta);
    expect(samples.t).toHaveLength(740);
    expect(samples).toMatchObject({ format_version: 12, tick_ms: 50, duration_ms: 3545 });
    expect(samples.finished).toBe(true);
    // Frame 0: pitch short 65527 is -0.05°, yaw 37 is 0.2°; jump held, right, in the air.
    expect(Array.from(samples.ang).slice(0, 3)).toEqual([Math.fround(-0.05), Math.fround(0.2), 0]);
    expect(Array.from(samples.pos).slice(0, 3)).toEqual([262334 / 256, -131163 / 256, 16591 / 256]);
    expect(Array.from(samples.vel).slice(0, 3)).toEqual([250, -120, 271]);
    expect(samples.input?.[0]).toBe(2 | 256 | 32768);
    expect(samples.flags?.[0]).toBe(4);
    // Frame 3 adds attack (button 1): flags bit 2.
    expect(samples.input?.[3]).toBe(1 | 2 | 256 | 32768);
    expect(samples.flags?.[3]).toBe(2 | 4);
    // Ladder state (8) sets aux bit 1; GSC aux 4 is weapon state 2.
    const ladder = golden.frames.findIndex((frame) => frame[12] & 8);
    expect((samples.aux?.[ladder] ?? 0) & 1).toBe(1);
    expect(samples.markers).toEqual([
      { t: 0, kind: "fps", fps: 333 },
      { t: 300, kind: "save" },
      { t: 600, kind: "load" },
      { t: 900, kind: "checkpoint", cp_id: 7 },
      { t: 1351, kind: "fps", fps: 250 },
      { t: 3545, kind: "finish" },
      { t: 3545, kind: "checkpoint", cp_id: 9 },
    ]);
    expect(samples.skips).toEqual([{ start_t: 300, target_t: 600, fails: 1 }]);
  });

  it("keeps every k-th frame and the last above the budget, OR-ing dropped presses", () => {
    const full = v12Samples(bytes, meta);
    const thin = v12Samples(bytes, meta, 100);
    const kept = [...Array.from({ length: 93 }, (_, index) => index * 8), 739];
    expect(Array.from(thin.t)).toEqual(kept.map((frame) => full.t[frame]));
    expect(thin.duration_ms).toBe(full.duration_ms);
    expect(thin.markers).toEqual(full.markers);
    expect(thin.skips).toEqual(full.skips);
    let carried = 0;
    kept.forEach((frame, slot) => {
      let press = 0;
      for (let index = slot ? kept[slot - 1] + 1 : 0; index <= frame; index += 1) {
        press |= (full.input?.[index] ?? 0) & PRESS;
      }
      expect((thin.input?.[slot] ?? 0) & PRESS).toBe(press);
      if (press !== ((full.input?.[frame] ?? 0) & PRESS)) carried += 1;
    });
    // The fixture's one-frame attack (frame 3) only survives through the OR.
    expect(carried).toBeGreaterThan(0);
  });
});
