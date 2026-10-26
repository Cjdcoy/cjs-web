import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ReplayMarker, ReplaySkip } from "../../lib/api";
import { findAutoSkip, recordSkip, skippedLoadCount } from "./replayHudModel";

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

interface PlaybackClock {
  anchorTime: number;
  anchorWall: number;
  playing: boolean;
  speed: number;
  /** Where the viewer last seeked to; auto-skip leaves that window alone. */
  seekTime: number | null;
}

export interface AutoSkipOptions {
  enabled: boolean;
  skips: readonly ReplaySkip[] | undefined;
  markers: readonly ReplayMarker[];
}

/** Optional analytics hooks; times are replay ms like `start` and `end`. */
export interface PlaybackObserver {
  /** A stretch played while the tab was visible; `wallMs` is its real duration. */
  onSegment?: (fromT: number, toT: number, wallMs: number, speed: number) => void;
  onSeek?: (from: number, to: number) => void;
}

/**
 * Wall-clock driven playback between `start` and `end` (ms). `getTime` is stable and cheap, so the
 * 3D view can read it every frame; `time` is React state for the controls. While playing with
 * auto-skip on, `getTime` jumps over failed attempts and records them in `executedSkips`.
 * Playback opens paused at `initialTime` (read on mount only).
 */
export function useReplayPlayback(
  start: number,
  end: number,
  autoSkip?: AutoSkipOptions,
  observer?: RefObject<PlaybackObserver | null>,
  initialTime = start,
) {
  const clock = useRef<PlaybackClock>({
    anchorTime: initialTime,
    anchorWall: 0,
    playing: false,
    speed: 1,
    // A shared start counts as a seek, so auto-skip does not jump off the moment it points at.
    seekTime: initialTime === start ? null : initialTime,
  });
  const autoSkipRef = useRef(autoSkip);
  /** Segments are reported only while the tab is visible; hidden time is never counted. */
  const reportSegments = useRef(true);
  const [time, setTime] = useState(initialTime);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [executedSkips, setExecutedSkips] = useState<ReadonlyMap<number, number>>(new Map());

  useEffect(() => {
    autoSkipRef.current = autoSkip;
  }, [autoSkip]);

  /** Reports what played since the clock's anchor, up to `toT`. */
  const closeSegment = useCallback(
    (current: PlaybackClock, toT: number) => {
      if (!current.playing || !reportSegments.current || toT <= current.anchorTime) return;
      // Derived from the replay span, so the end clamp and a late frame do not inflate it.
      const wallMs = (toT - current.anchorTime) / current.speed;
      observer?.current?.onSegment?.(current.anchorTime, toT, wallMs, current.speed);
    },
    [observer],
  );

  const getTime = useCallback(() => {
    const current = clock.current;
    if (!current.playing) return current.anchorTime;
    const now = Math.min(
      end,
      current.anchorTime + (performance.now() - current.anchorWall) * current.speed,
    );
    const options = autoSkipRef.current;
    if (!options?.enabled || !options.skips) return now;
    const skip = findAutoSkip(options.skips, now, current.seekTime);
    if (!skip) return now;
    const fails = skippedLoadCount(options.markers, now, skip.target_t);
    closeSegment(current, now);
    clock.current = { ...current, anchorTime: skip.target_t, anchorWall: performance.now() };
    setExecutedSkips((executed) => recordSkip(executed, skip.target_t, fails));
    return skip.target_t;
  }, [closeSegment, end]);

  const rebase = useCallback(
    (patch: Partial<PlaybackClock>) => {
      const now = getTime();
      closeSegment(clock.current, now);
      clock.current = {
        ...clock.current,
        anchorTime: now,
        anchorWall: performance.now(),
        ...patch,
      };
      setTime(clock.current.anchorTime);
    },
    [closeSegment, getTime],
  );

  /** Closes the current segment (for a flush) without changing playback. */
  const flushSegment = useCallback(() => rebase({}), [rebase]);

  const seek = useCallback(
    (target: number) => {
      const clamped = Math.min(end, Math.max(start, target));
      const from = getTime();
      rebase({ anchorTime: clamped, seekTime: clamped });
      observer?.current?.onSeek?.(from, clamped);
    },
    [end, getTime, observer, rebase, start],
  );

  const setPlaying = useCallback(
    (next: boolean) => {
      const restart = next && getTime() >= end;
      rebase({ playing: next, ...(restart ? { anchorTime: start, seekTime: null } : {}) });
      setPlayingState(next);
    },
    [end, getTime, rebase, start],
  );

  const setSpeed = useCallback(
    (next: number) => {
      rebase({ speed: next });
      setSpeedState(next);
    },
    [rebase],
  );

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    const tick = () => {
      const current = getTime();
      setTime(current);
      if (current >= end) {
        rebase({ playing: false });
        setPlayingState(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, getTime, playing, rebase]);

  useEffect(() => {
    if (!observer) return undefined;
    const onVisibility = () => {
      // Hidden: close the visible segment. Visible: re-anchor without reporting the hidden time.
      const visible = document.visibilityState !== "hidden";
      rebase({});
      reportSegments.current = visible;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [observer, rebase]);

  return {
    executedSkips,
    flushSegment,
    getTime,
    playing,
    seek,
    setPlaying,
    setSpeed,
    speed,
    time,
  };
}
