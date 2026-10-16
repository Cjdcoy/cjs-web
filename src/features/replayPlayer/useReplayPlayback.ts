import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Wall-clock driven playback between `start` and `end` (ms). `getTime` is stable and cheap, so the
 * 3D view can read it every frame; `time` is React state for the controls. While playing with
 * auto-skip on, `getTime` jumps over failed attempts and records them in `executedSkips`.
 */
export function useReplayPlayback(start: number, end: number, autoSkip?: AutoSkipOptions) {
  const clock = useRef<PlaybackClock>({
    anchorTime: start,
    anchorWall: 0,
    playing: false,
    speed: 1,
    seekTime: null,
  });
  const autoSkipRef = useRef(autoSkip);
  const [time, setTime] = useState(start);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [executedSkips, setExecutedSkips] = useState<ReadonlyMap<number, number>>(new Map());

  useEffect(() => {
    autoSkipRef.current = autoSkip;
  }, [autoSkip]);

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
    clock.current = { ...current, anchorTime: skip.target_t, anchorWall: performance.now() };
    setExecutedSkips((executed) => recordSkip(executed, skip.target_t, fails));
    return skip.target_t;
  }, [end]);

  const rebase = useCallback(
    (patch: Partial<PlaybackClock>) => {
      clock.current = {
        ...clock.current,
        anchorTime: getTime(),
        anchorWall: performance.now(),
        ...patch,
      };
      setTime(clock.current.anchorTime);
    },
    [getTime],
  );

  const seek = useCallback(
    (target: number) => {
      const clamped = Math.min(end, Math.max(start, target));
      rebase({ anchorTime: clamped, seekTime: clamped });
    },
    [end, rebase, start],
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

  return { executedSkips, getTime, playing, seek, setPlaying, setSpeed, speed, time };
}
