import { useEffect, useRef, useState, type RefObject } from "react";
import { REPLAY_API_BASE } from "../../lib/api";
import { isReplayViewAnalyticsEnabled, sendReplayView } from "../../lib/api/replayViews";
import { previousRouteId } from "../../lib/routing";
import {
  createReplayView,
  FLUSH_INTERVAL_MS,
  newViewId,
  noteFlags,
  recordSegment,
  recordSeek,
  takeFlush,
  trackingAllowed,
  viewDevice,
  viewEntry,
  type ReplayViewState,
} from "./replayViewTracker";
import type { PlaybackObserver } from "./useReplayPlayback";
import type { ViewMode } from "./useViewMode";

const sendToApi = (body: string) => sendReplayView(REPLAY_API_BASE, body);

/**
 * Connects playback to the view tracker (ADR 0005). The view starts on the first Play and is
 * flushed every 30 s, when the tab hides, on `pagehide`, and on unmount (in-app navigation).
 * Off unless `VITE_REPLAY_VIEW_ANALYTICS=1`, and never under Do Not Track or GPC.
 */
export function useReplayViewAnalytics({
  autoSkip,
  flushSegment,
  mode,
  observer,
  playing,
  runId,
  send = sendToApi,
  skippedFails,
  span,
  start,
}: {
  /** Auto-skip is on and this replay has a skip plan. */
  autoSkip: boolean;
  flushSegment: () => void;
  mode: ViewMode;
  observer: RefObject<PlaybackObserver | null>;
  playing: boolean;
  runId: number;
  send?: (body: string) => void;
  skippedFails: number;
  span: number;
  start: number;
}): void {
  const [enabled] = useState(
    () =>
      isReplayViewAnalyticsEnabled() &&
      trackingAllowed(globalThis.navigator, (globalThis as { doNotTrack?: string }).doNotTrack),
  );
  const view = useRef<ReplayViewState | null>(null);
  const latest = useRef({ autoSkip, flushSegment, mode, send, skippedFails });

  // Declared first so the effects below see this render's values.
  useEffect(() => {
    latest.current = { autoSkip, flushSegment, mode, send, skippedFails };
    if (view.current) view.current = noteFlags(view.current, flagsOf(latest.current));
  });

  useEffect(() => {
    if (!enabled || !playing || view.current) return;
    view.current = noteFlags(
      createReplayView({
        viewId: newViewId(),
        runId,
        durationMs: span,
        entry: viewEntry(previousRouteId()),
        device: viewDevice(globalThis.matchMedia?.bind(globalThis)),
      }),
      flagsOf(latest.current),
    );
  }, [enabled, playing, runId, span]);

  useEffect(() => {
    if (!enabled) return undefined;
    observer.current = {
      onSegment: (fromT, toT, wallMs, speed) => {
        if (!view.current) return;
        const segment = recordSegment(view.current, fromT - start, toT - start, wallMs, speed);
        // Auto-skip counts only when it was on while the replay played.
        view.current = noteFlags(segment, { autoSkip: latest.current.autoSkip });
      },
      onSeek: (from, to) => {
        if (!view.current) return;
        view.current = recordSeek(view.current, from - start, to - start, performance.now());
      },
    };
    const flush = () => {
      if (!view.current) return;
      latest.current.flushSegment();
      view.current = noteFlags(view.current, flagsOf(latest.current));
      const result = takeFlush(view.current);
      if (!result) return;
      view.current = result.state;
      latest.current.send(JSON.stringify(result.payload));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const interval = window.setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      observer.current = null;
    };
  }, [enabled, observer, start]);
}

function flagsOf({ mode, skippedFails }: { mode: ViewMode; skippedFails: number }) {
  return { skippedFails, cinema: mode === "cinema", fullscreen: mode === "fullscreen" };
}
