import { useCallback, useEffect, useRef, useState } from "react";
import { modelAssetUrl } from "../../lib/mapModels";
import type { CollisionProbe } from "../mapViewer";
import type { ReplayTimeline } from "./replayPlayback";
import {
  parseSoundManifest,
  pickVariant,
  soundEvents,
  startCursor,
  surfaceName,
  variantsFor,
  type SoundContext,
  type SoundEvent,
  type SoundManifest,
} from "./replaySound";

export type SoundStatus = "off" | "loading" | "ready" | "unavailable";

interface AudioOutput {
  context: AudioContext;
  master: GainNode;
}

/** Above this speed movement sounds would pile up, so playback is muted. */
const MAX_SOUND_SPEED = 2;
/** A longer jump in playback time is a seek, auto-skip, or stall: restart without a backlog. */
const MAX_CONTINUOUS_MS = 400;
/** Sounds still decoding after this long are dropped rather than played late. */
const MAX_LATE_SECONDS = 0.15;

/**
 * Plays replay sound events through Web Audio. The manifest loads on first enable; the audio
 * context starts on a user gesture (`unlock`, called from Play). Sounds play only during forward
 * playback at up to 2× speed.
 */
export function useReplaySound({
  enabled,
  getTime,
  playing,
  speed,
  timeline,
  volume,
}: {
  enabled: boolean;
  getTime: () => number;
  playing: boolean;
  speed: number;
  timeline: ReplayTimeline;
  volume: number;
}) {
  const manifestUrl = modelAssetUrl("sounds/sounds.json");
  const [manifest, setManifest] = useState<SoundManifest | null>(null);
  const [failed, setFailed] = useState(false);
  const [probe, setProbe] = useState<CollisionProbe | null>(null);
  const [output, setOutput] = useState<AudioOutput | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const lastPicks = useRef(new Map<string, number>());
  const surfaces = useRef(new Map<number, string | null>());

  useEffect(() => {
    if (!enabled || manifest || failed || !manifestUrl) return undefined;
    const controller = new AbortController();
    fetch(manifestUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        const parsed = parseSoundManifest(value);
        if (parsed) setManifest(parsed);
        else setFailed(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [enabled, failed, manifest, manifestUrl]);

  useEffect(() => {
    if (output) output.master.gain.value = volume;
  }, [output, volume]);

  useEffect(() => () => void output?.context.close().catch(() => undefined), [output]);

  /** Starts (or resumes) audio from a user gesture such as the Play click. */
  const unlock = useCallback(() => {
    if (!enabled || typeof AudioContext === "undefined") return;
    if (output) {
      void output.context.resume().catch(() => undefined);
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    setOutput({ context, master });
  }, [enabled, output, volume]);

  const loadBuffer = useCallback(
    (file: string) => {
      let buffer = buffers.current.get(file);
      const url = modelAssetUrl(file);
      if (!buffer && output && url) {
        buffer = fetch(url)
          .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject()))
          .then((data) => output.context.decodeAudioData(data))
          .catch(() => null);
        buffers.current.set(file, buffer);
      }
      return buffer ?? Promise.resolve(null);
    },
    [output],
  );

  // Decode the sounds this map can make up front: its surfaces plus defaults, weapon, and ladder.
  useEffect(() => {
    if (!manifest || !output || !probe) return;
    const names = new Set([manifest.fallback, "wood"]);
    for (const flags of probe.surfaceFlags) {
      const name = surfaceName(manifest, flags);
      if (name) names.add(name);
    }
    const tables = ["gearRattleRun", "gearRattleWalk", "ladder", "raise.0", "raiseSecondary.0"];
    for (const name of names)
      tables.push(`footstep.${name}`, `footstepWalk.${name}`, `land.${name}`);
    for (const table of tables) {
      for (const variant of variantsFor(manifest, table)) {
        if (variant.file) void loadBuffer(variant.file);
      }
    }
  }, [loadBuffer, manifest, output, probe]);

  const surfaceAt = useCallback(
    (index: number) => {
      if (!manifest || !probe) return null;
      if (!surfaces.current.has(index)) {
        const { pos } = timeline.samples;
        const flags = probe.surfaceFlagsBelow(
          pos[index * 3],
          pos[index * 3 + 1],
          pos[index * 3 + 2],
        );
        surfaces.current.set(index, surfaceName(manifest, flags));
      }
      return surfaces.current.get(index) ?? null;
    },
    [manifest, probe, timeline],
  );

  const play = useCallback(
    (event: SoundEvent) => {
      if (!manifest || !output) return;
      const { context, master } = output;
      for (const table of event.tables) {
        const variants = variantsFor(manifest, table);
        if (variants.length === 0) continue;
        const index = pickVariant(variants, lastPicks.current.get(table), Math.random);
        lastPicks.current.set(table, index);
        const variant = variants[index];
        // A null file is the engine's null.wav: a valid, silent pick.
        if (!variant.file) continue;
        const requested = context.currentTime;
        void loadBuffer(variant.file).then((buffer) => {
          if (!buffer || context.currentTime - requested > MAX_LATE_SECONDS) return;
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          source.playbackRate.value = uniform(variant.pitch);
          gain.gain.value = uniform(variant.volume);
          source.connect(gain).connect(master);
          source.start();
        });
      }
    },
    [loadBuffer, manifest, output],
  );

  useEffect(() => {
    if (!playing || !enabled || !manifest || !output) return undefined;
    const soundContext: SoundContext = { timeline, rules: manifest.rules, surfaceAt };
    let cursor = startCursor(getTime());
    let frame = 0;
    const tick = () => {
      const now = getTime();
      const jumped = now < cursor.time || now - cursor.time > MAX_CONTINUOUS_MS;
      if (speed > MAX_SOUND_SPEED || jumped) {
        cursor = startCursor(now);
      } else {
        const result = soundEvents(soundContext, cursor, now);
        cursor = result.cursor;
        result.events.forEach(play);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, getTime, manifest, output, play, playing, speed, surfaceAt, timeline]);

  const status: SoundStatus =
    !manifestUrl || failed ? "unavailable" : !enabled ? "off" : manifest ? "ready" : "loading";
  return { setProbe, status, unlock };
}

function uniform([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}
