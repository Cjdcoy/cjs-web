import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayViewPayload } from "./replayViewTracker";
import { useReplayPlayback, type PlaybackObserver } from "./useReplayPlayback";
import { useReplayViewAnalytics } from "./useReplayViewAnalytics";

let now = 0;
const send = vi.fn<(body: string) => void>();

function useHarness() {
  const observer = useRef<PlaybackObserver | null>(null);
  const playback = useReplayPlayback(0, 60_000, undefined, observer);
  useReplayViewAnalytics({
    autoSkip: false,
    flushSegment: playback.flushSegment,
    mode: "normal",
    observer,
    playing: playback.playing,
    runId: 7001,
    send,
    skippedFails: 0,
    span: 60_000,
    start: 0,
  });
  return playback;
}

function sent(): ReplayViewPayload[] {
  return send.mock.calls.map(([body]) => JSON.parse(body) as ReplayViewPayload);
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

/** Plays from the current position for `ms` of wall time, then pauses. */
function playFor(result: { current: ReturnType<typeof useHarness> }, ms: number) {
  act(() => result.current.setPlaying(true));
  now += ms;
  act(() => result.current.setPlaying(false));
}

describe("useReplayViewAnalytics", () => {
  beforeEach(() => {
    now = 0;
    send.mockReset();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(document, "visibilityState");
    Reflect.deleteProperty(navigator, "globalPrivacyControl");
  });

  it("waits for 5 s of visible playback and never counts hidden time", () => {
    const { result, unmount } = renderHook(useHarness);

    playFor(result, 4_000);
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(send).not.toHaveBeenCalled();

    act(() => result.current.setPlaying(true));
    now += 2_000;
    // Hiding the tab closes the segment and flushes the first 6 s.
    setVisibility("hidden");
    expect(sent()).toMatchObject([
      { seq: 1, watched: [[0, 6_000]], speed_ms: [0, 0, 6_000, 0, 0] },
    ]);
    // Playback keeps running for 28 s while hidden; none of it is reported.
    now += 28_000;
    setVisibility("visible");
    now += 1_000;
    act(() => result.current.setPlaying(false));
    // A repeated hide with nothing new sends nothing.
    setVisibility("hidden");
    setVisibility("visible");

    // Leaving the page in-app (unmount) sends the rest.
    unmount();
    expect(sent()).toHaveLength(2);
    expect(sent()[1]).toMatchObject({
      seq: 2,
      watched: [
        [0, 6_000],
        [34_000, 35_000],
      ],
      played: [[34_000, 35_000]],
      speed_ms: [0, 0, 7_000, 0, 0],
      entry: "direct",
    });
    expect(sent()[1].view_id).toBe(sent()[0].view_id);
  });

  it("starts on the first Play, so earlier seeks are not counted", () => {
    const { result, unmount } = renderHook(useHarness);
    act(() => result.current.seek(30_000));
    act(() => result.current.seek(0));
    playFor(result, 6_000);
    act(() => result.current.seek(50_000));
    unmount();
    expect(sent()).toMatchObject([{ seq: 1, seeks: 1, top_seeks: [[6_000, 50_000]] }]);
  });

  it("flushes every 30 s while playing", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { result, unmount } = renderHook(useHarness);
      act(() => result.current.setPlaying(true));
      now += 30_000;
      act(() => vi.advanceTimersByTime(30_000));
      expect(sent()).toMatchObject([{ seq: 1, watched: [[0, 30_000]] }]);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["the feature flag is off", () => vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "")],
    [
      "Global Privacy Control is on",
      () =>
        Object.defineProperty(navigator, "globalPrivacyControl", {
          configurable: true,
          value: true,
        }),
    ],
  ])("sends nothing when %s", (_, setUp) => {
    setUp();
    const { result, unmount } = renderHook(useHarness);
    playFor(result, 20_000);
    unmount();
    expect(send).not.toHaveBeenCalled();
  });
});
