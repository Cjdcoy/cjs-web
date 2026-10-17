import { describe, expect, it } from "vitest";
import {
  createReplayView,
  mergeRange,
  newViewId,
  noteFlags,
  recordSeek,
  recordSegment,
  takeFlush,
  trackingAllowed,
  viewDevice,
  viewEntry,
  type ReplayViewState,
} from "./replayViewTracker";

function view(): ReplayViewState {
  return createReplayView({
    viewId: "0123456789abcdef0123456789abcdef",
    runId: 7001,
    durationMs: 60_000,
    entry: "map",
    device: "desktop",
  });
}

/** Plays `from`..`to` at `speed`, taking (to − from) / speed of wall time. */
function play(state: ReplayViewState, from: number, to: number, speed = 1): ReplayViewState {
  return recordSegment(state, from, to, (to - from) / speed, speed);
}

describe("mergeRange", () => {
  it("keeps ranges sorted and joins overlapping and touching ones", () => {
    let ranges = mergeRange([], [10, 20]);
    ranges = mergeRange(ranges, [40, 50]);
    ranges = mergeRange(ranges, [0, 5]);
    expect(ranges).toEqual([
      [0, 5],
      [10, 20],
      [40, 50],
    ]);
    expect(mergeRange(ranges, [5, 12])).toEqual([
      [0, 20],
      [40, 50],
    ]);
    expect(mergeRange(ranges, [15, 45])).toEqual([
      [0, 5],
      [10, 50],
    ]);
  });

  it("joins the pair with the smallest gap when over the cap", () => {
    const ranges = mergeRange(
      [
        [0, 10],
        [30, 40],
        [42, 50],
      ],
      [100, 110],
      3,
    );
    expect(ranges).toEqual([
      [0, 10],
      [30, 50],
      [100, 110],
    ]);
  });

  it("never sends more than 64 watched pairs", () => {
    let state = view();
    for (let index = 0; index < 100; index += 1) {
      state = play(state, index * 500, index * 500 + 100);
    }
    const payload = takeFlush(state)?.payload;
    expect(payload?.watched).toHaveLength(64);
    expect(payload?.played).toHaveLength(64);
  });
});

describe("replay view tracker", () => {
  it("sends nothing under 5 s of real playback", () => {
    // 20 s of replay at 4× is 5 s of wall time, just at the floor; 4.99 s is under it.
    const under = recordSegment(view(), 0, 19_960, 4_990, 4);
    expect(takeFlush(under)).toBeNull();
    expect(takeFlush(play(under, 19_960, 20_000, 4))).not.toBeNull();
  });

  it("numbers flushes, keeps counters cumulative, and sends nothing when unchanged", () => {
    let state = noteFlags(play(view(), 0, 6_000), { cinema: true });
    const first = takeFlush(state);
    expect(first?.payload).toEqual({
      v: 1,
      view_id: "0123456789abcdef0123456789abcdef",
      run_id: 7001,
      seq: 1,
      duration_ms: 60_000,
      speed_ms: [0, 0, 6_000, 0, 0],
      watched: [[0, 6_000]],
      played: [[0, 6_000]],
      max_pos_ms: 6_000,
      seeks: 0,
      top_seeks: [],
      auto_skip: false,
      skipped_fails: 0,
      cinema: true,
      fullscreen: false,
      entry: "map",
      device: "desktop",
    });
    state = first?.state ?? state;
    // A repeated beacon (visibilitychange then pagehide) has nothing new to send.
    expect(takeFlush(state)).toBeNull();

    // A rewatch at 2× adds a played segment but no new coverage.
    state = play(state, 2_000, 6_000, 2);
    const second = takeFlush(state);
    expect(second?.payload).toMatchObject({
      seq: 2,
      speed_ms: [0, 0, 6_000, 2_000, 0],
      watched: [[0, 6_000]],
      played: [[2_000, 6_000]],
      cinema: true,
    });
    expect(second?.state.seq).toBe(2);
  });

  it("sends only integers, as the API rejects fractions", () => {
    let state = recordSegment(view(), 0.4, 3_333.7, 3_333.3, 1);
    state = recordSegment(state, 3_333.7, 9_999.9, 1_666.6, 4);
    state = recordSeek(noteFlags(state, { skippedFails: 2.6 }), 100.5, 20_000.4, 0);
    const numbers = JSON.stringify(takeFlush(state)?.payload).match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(10);
    expect(numbers.filter((value) => value.includes("."))).toEqual([]);
  });

  it("clamps segments to the replay and counts wall time for every speed", () => {
    let state = recordSegment(view(), -500, 1_000, 6_000, 0.25);
    state = recordSegment(state, 59_000, 70_000, 1_000, 1);
    expect(takeFlush(state)?.payload).toMatchObject({
      speed_ms: [6_000, 0, 1_000, 0, 0],
      watched: [
        [0, 1_000],
        [59_000, 60_000],
      ],
      max_pos_ms: 60_000,
    });
  });

  it("counts a slider drag as one seek and keeps the 10 largest", () => {
    let state = play(view(), 0, 5_000);
    state = recordSeek(state, 5_000, 6_000, 1_000);
    state = recordSeek(state, 6_000, 9_000, 1_200);
    state = recordSeek(state, 9_000, 40_000, 1_650);
    expect(takeFlush(state)?.payload).toMatchObject({ seeks: 1, top_seeks: [[5_000, 40_000]] });

    for (let index = 0; index < 12; index += 1) {
      state = recordSeek(state, 0, (index + 1) * 1_000, 10_000 + index * 1_000);
    }
    const payload = takeFlush(state)?.payload;
    expect(payload?.seeks).toBe(13);
    expect(payload?.top_seeks).toHaveLength(10);
    expect(payload?.top_seeks[0]).toEqual([5_000, 40_000]);
    expect(payload?.top_seeks.at(-1)).toEqual([0, 4_000]);
  });

  it("keeps flags once set and the highest skipped-fail count", () => {
    let state = noteFlags(view(), { autoSkip: true, skippedFails: 4, fullscreen: true });
    state = noteFlags(state, { autoSkip: false, skippedFails: 2, fullscreen: false });
    expect(state).toMatchObject({ autoSkip: true, skippedFails: 4, fullscreen: true });
    const unchanged = { ...state, dirty: false };
    expect(noteFlags(unchanged, { skippedFails: 3 })).toBe(unchanged);
  });
});

describe("collection inputs", () => {
  it("honours Do Not Track and Global Privacy Control", () => {
    expect(trackingAllowed({})).toBe(true);
    expect(trackingAllowed({ doNotTrack: "0", globalPrivacyControl: false })).toBe(true);
    expect(trackingAllowed({ doNotTrack: "1" })).toBe(false);
    expect(trackingAllowed({ globalPrivacyControl: true })).toBe(false);
    expect(trackingAllowed({}, "1")).toBe(false);
  });

  it("maps the previous in-app route to an entry", () => {
    expect(viewEntry(null)).toBe("direct");
    expect(viewEntry("map-detail")).toBe("map");
    expect(viewEntry("map-viewer")).toBe("map");
    expect(viewEntry("player-detail")).toBe("player");
    expect(viewEntry("recent")).toBe("recent");
    expect(viewEntry("replay")).toBe("other");
  });

  it("classifies the viewport and makes 128-bit hex view ids", () => {
    expect(viewDevice(() => ({ matches: true }))).toBe("mobile");
    expect(viewDevice(() => ({ matches: false }))).toBe("desktop");
    expect(viewDevice(undefined)).toBe("desktop");
    expect(newViewId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newViewId()).not.toBe(newViewId());
  });
});
