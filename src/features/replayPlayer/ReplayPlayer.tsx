import {
  Keyboard,
  Maximize,
  Minimize,
  Move3d,
  Pause,
  Play,
  RectangleHorizontal,
  Share,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Sun,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton, Select, VisuallyHidden } from "../../components/ui";
import type { ReplayMarkerKind, ReplaySamples } from "../../lib/api";
import { getViewmodelUrl } from "../../lib/mapModels";
import { useBrowserLocation } from "../../lib/routing";
import { MapViewer, type CodPose, type ViewerFrame, type ViewmodelOptions } from "../mapViewer";
import {
  DEFAULT_HUD_PREFERENCES,
  useHudPreferences,
  type HudPreferences,
  type HudToggleKey,
} from "./hudPreferences";
import { ReplayHud } from "./ReplayHud";
import {
  angleHelperAt,
  fpsAt,
  jumpTimerAt,
  keysAt,
  positionHudLines,
  skippedFails,
  speedAt,
  weaponHolstered,
} from "./replayHudModel";
import {
  addLean,
  createTimeline,
  eyeHeight,
  findMarker,
  findSampleIndex,
  formatReplayClock,
  leanAt,
  meleeElapsed,
  pathSegments,
  sampleMotion,
  samplePose,
  stepSampleTime,
  type ReplayTimeline,
} from "./replayPlayback";
import { readReplayStartOffset } from "./replayShare";
import { createWeaponTrack, weaponAt } from "./replayWeapon";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ReplayHeatStrip } from "./ReplayWebViews";
import { PLAYBACK_SPEEDS, useReplayPlayback, type PlaybackObserver } from "./useReplayPlayback";
import { useReplayViewAnalytics } from "./useReplayViewAnalytics";
import { useReplayHeat } from "./useReplayWebViews";
import { useReplaySound } from "./useReplaySound";
import { useViewMode, type ViewMode } from "./useViewMode";

const SEEK_STEP_MS = 5_000;
const JUMP_KINDS: readonly ReplayMarkerKind[] = ["save", "load"];
type TimelineKind = Exclude<ReplayMarkerKind, "fps">;
const MARKER_LABELS: Readonly<Record<TimelineKind, string>> = {
  save: "Saves",
  load: "Loads",
  checkpoint: "Checkpoints",
  finish: "Finish",
};

export function ReplayPlayer({ modelUrl, samples }: { modelUrl: string; samples: ReplaySamples }) {
  const timeline = useMemo(() => createTimeline(samples), [samples]);
  const weaponTrack = useMemo(() => createWeaponTrack(timeline), [timeline]);
  const path = useMemo(() => pathSegments(timeline), [timeline]);
  const { start, end } = timeline;
  const [preferences, setPreference] = useHudPreferences();
  const autoSkipOptions = useMemo(
    () => ({ enabled: preferences.autoSkip, skips: samples.skips, markers: samples.markers }),
    [preferences.autoSkip, samples.markers, samples.skips],
  );
  const playbackObserver = useRef<PlaybackObserver | null>(null);
  const { search } = useBrowserLocation();
  const playback = useReplayPlayback(
    start,
    end,
    autoSkipOptions,
    playbackObserver,
    Math.min(end, start + readReplayStartOffset(search)),
  );
  // Older formats record one sample per 50 ms, not per frame, so frame steps would mean nothing.
  const frameStep = samples.format_version >= 12;
  const { executedSkips, flushSegment, getTime, playing, seek, setPlaying, setSpeed, speed, time } =
    playback;
  const sound = useReplaySound({
    getTime,
    playing,
    speed,
    timeline,
    volume: preferences.volume,
  });
  const sampleIndex = findSampleIndex(samples.t, time);
  // Like in-game, the weapon is hidden while the runner has none out (for example on ladders).
  const holstered = weaponHolstered(samples, sampleIndex);
  const [viewmodelMissing, setViewmodelMissing] = useState(false);
  const viewmodelUrl = getViewmodelUrl();
  const viewmodel = useMemo<ViewmodelOptions | undefined>(
    () =>
      viewmodelUrl
        ? {
            url: viewmodelUrl,
            visible: preferences.viewmodel && !viewmodelMissing && !holstered,
            onUnavailable: () => setViewmodelMissing(true),
          }
        : undefined,
    [holstered, preferences.viewmodel, viewmodelMissing, viewmodelUrl],
  );
  const heat = useReplayHeat(samples.run_id);
  const heatReady = heat.data?.view_count.some((count) => count > 0) === true;
  const available = useMemo(
    () => ({
      angleHelper: Boolean(samples.flags && samples.input),
      keys: samples.input !== undefined,
      fps: samples.markers.some((marker) => marker.fps) || (samples.run_fps ?? 0) > 0,
      position: true,
      jumpTimer: samples.flags !== undefined,
      autoSkip: samples.skips !== undefined,
      speed: true,
      viewmodel: viewmodelUrl !== null && !viewmodelMissing,
      crosshair: true,
      heatmap: heatReady,
    }),
    [heatReady, samples, viewmodelMissing, viewmodelUrl],
  );
  const soundAvailable = sound.status !== "unavailable";
  const fps = fpsAt(samples, time);
  const skipped = skippedFails(executedSkips, time);
  const [follow, setFollow] = useState(true);
  const playerRef = useRef<HTMLElement>(null);
  const shortcutsRef = useRef<HTMLDialogElement>(null);
  const shareRef = useRef<HTMLDialogElement>(null);
  const [shareOffset, setShareOffset] = useState(0);
  const { controlsHidden, mode, setMode } = useViewMode(playerRef);
  const totalSkippedFails = useMemo(
    () => [...executedSkips.values()].reduce((total, fails) => total + fails, 0),
    [executedSkips],
  );
  useReplayViewAnalytics({
    autoSkip: available.autoSkip && preferences.autoSkip,
    flushSegment,
    mode,
    observer: playbackObserver,
    playing,
    runId: samples.run_id,
    skippedFails: totalSkippedFails,
    span: end - start,
    start,
  });
  const [announcement, setAnnouncement] = useState("");
  const followRef = useRef(follow);
  const span = Math.max(1, end - start);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  const getFrame = useCallback((): ViewerFrame => {
    const time = getTime();
    const lean = leanAt(timeline, time);
    const eye = samplePose(timeline, time);
    const gun = weaponAt(weaponTrack, time, eye.pitch);
    const pose = addLean({ ...eye, z: eye.z + gun.dip }, lean);
    // CG_CalcViewValues keeps the eye at least 8 units above the feet (mac:349292-349294).
    const feet = eye.z - eyeHeight(timeline, time);
    return {
      pose: { ...pose, z: Math.max(pose.z, feet + 8) },
      follow: followRef.current,
      weapon: {
        lean,
        meleeMs: meleeElapsed(timeline, time),
        raiseMs: gun.raiseMs,
        offset: gun.offset,
        angles: gun.angles,
      },
    };
  }, [getTime, timeline, weaponTrack]);

  const timelineMarkers = useMemo(
    () => samples.markers.filter((marker) => marker.kind !== "fps"),
    [samples.markers],
  );
  const markerCounts = useMemo(() => {
    const counts: Record<TimelineKind, number> = { save: 0, load: 0, checkpoint: 0, finish: 0 };
    for (const marker of timelineMarkers) counts[marker.kind as TimelineKind] += 1;
    return counts;
  }, [timelineMarkers]);

  const { unlock: unlockSound } = sound;
  const togglePlaying = useCallback(() => {
    // Play is the user gesture that lets the browser start audio.
    if (!playing && preferences.volume > 0) unlockSound();
    setPlaying(!playing);
    setAnnouncement(playing ? "Paused" : "Playing");
  }, [playing, preferences.volume, setPlaying, unlockSound]);

  // Unmute restores the last audible volume.
  const audibleVolume = useRef(preferences.volume || DEFAULT_HUD_PREFERENCES.volume);
  const changeVolume = useCallback(
    (next: number) => {
      // A volume change is also an audio-starting gesture; decide on the new value, not the
      // rendered one, which is still the old volume during this event.
      if (next > 0) {
        unlockSound();
        audibleVolume.current = next;
      }
      setPreference("volume", next);
    },
    [setPreference, unlockSound],
  );
  const toggleMute = useCallback(() => {
    const next = preferences.volume > 0 ? 0 : audibleVolume.current;
    changeVolume(next);
    setAnnouncement(next > 0 ? "Sound on" : "Muted");
  }, [changeVolume, preferences.volume]);

  const changeSpeed = useCallback(
    (next: number) => {
      setSpeed(next);
      setAnnouncement(`Speed ${next}×`);
    },
    [setSpeed],
  );

  const toggleFollow = useCallback(() => {
    setFollow((current) => !current);
    setAnnouncement(
      follow
        ? "Free camera on. Focus the 3D view to fly; the runner is shown as a marker."
        : "Following the runner",
    );
  }, [follow]);

  const toggleMode = useCallback(
    (next: Exclude<ViewMode, "normal">) => setMode(mode === next ? "normal" : next),
    [mode, setMode],
  );

  const jump = useCallback(
    (direction: 1 | -1) => {
      const marker = findMarker(samples.markers, getTime(), direction, JUMP_KINDS);
      if (!marker) {
        setAnnouncement(direction === 1 ? "No later save or load" : "No earlier save or load");
        return;
      }
      seek(marker.t);
      setAnnouncement(
        `${marker.kind === "save" ? "Save" : "Load"} at ${formatReplayClock(marker.t - start)}`,
      );
    },
    [getTime, samples.markers, seek, start],
  );

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const from = getTime();
      if (playing) {
        setPlaying(false);
        setAnnouncement("Paused");
      }
      seek(stepSampleTime(timeline, from, direction));
    },
    [getTime, playing, seek, setPlaying, timeline],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      // Leave typing and option picking alone; the seek slider's arrows map to 5-second steps.
      if (target?.closest("textarea, select, [contenteditable], input:not([type='range'])")) return;
      // An open dialog handles its own keys, including Esc.
      if (target?.closest("dialog")) return;
      const activatable = Boolean(target?.closest("button, a, summary"));
      const speedIndex = PLAYBACK_SPEEDS.findIndex((value) => value === speed);
      let handled = true;
      switch (event.key) {
        case "k":
        case "K":
          togglePlaying();
          break;
        case " ":
          // Buttons, links, and disclosures activate themselves with Space.
          if (activatable) return;
          togglePlaying();
          break;
        case "ArrowLeft":
        case "ArrowRight":
          seek(getTime() + (event.key === "ArrowRight" ? SEEK_STEP_MS : -SEEK_STEP_MS));
          break;
        case "[":
          changeSpeed(PLAYBACK_SPEEDS[Math.max(0, speedIndex - 1)]);
          break;
        case "]":
          changeSpeed(PLAYBACK_SPEEDS[Math.min(PLAYBACK_SPEEDS.length - 1, speedIndex + 1)]);
          break;
        case "c":
        case "C":
          toggleFollow();
          break;
        case "f":
        case "F":
          toggleMode("fullscreen");
          break;
        case "t":
        case "T":
          toggleMode("cinema");
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "?":
          shortcutsRef.current?.showModal();
          break;
        case "Escape":
          // Browser full screen leaves on its own Esc; this closes the in-page fallback.
          if (mode === "normal" || document.fullscreenElement) return;
          setMode("normal");
          break;
        case "n":
        case "N":
          jump(1);
          break;
        case "p":
        case "P":
          jump(-1);
          break;
        case ",":
        case ".":
          if (!frameStep) return;
          stepFrame(event.key === "." ? 1 : -1);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    changeSpeed,
    frameStep,
    getTime,
    jump,
    mode,
    seek,
    setMode,
    speed,
    stepFrame,
    toggleFollow,
    toggleMode,
    toggleMute,
    togglePlaying,
  ]);

  return (
    <section
      ref={playerRef}
      className="cjs-replay-player cjs-stack"
      aria-label="Replay player"
      data-view={mode === "normal" ? undefined : mode}
      data-controls={controlsHidden ? "hidden" : undefined}
    >
      <MapViewer
        brightness={preferences.brightness}
        crosshair={preferences.crosshair}
        getFrame={getFrame}
        mapName={samples.mapname}
        modelUrl={modelUrl}
        path={path}
        viewmodel={viewmodel}
        onCollision={sound.setProbe}
        overlay={
          <ReplayHud
            fps={preferences.fps ? fps : null}
            helper={
              preferences.angleHelper
                ? angleHelperAt(samples, sampleIndex, fps, sampleMotion(timeline, time))
                : null
            }
            jumpTimer={preferences.jumpTimer ? jumpTimerAt(samples, sampleIndex, time) : null}
            keys={preferences.keys ? keysAt(samples, sampleIndex) : null}
            // The free camera shows its own position readout in the same corner.
            position={
              preferences.position && follow ? positionHudLines(feetPose(timeline, time)) : null
            }
            speed={preferences.speed ? speedAt(samples, sampleIndex) : null}
          />
        }
      >
        {(tools) => (
          <div className="cjs-replay-player__controls">
            <div className="cjs-replay-player__transport">
              <IconButton
                label={playing ? "Pause" : "Play"}
                aria-keyshortcuts="K"
                onClick={togglePlaying}
              >
                {playing ? (
                  <Pause size={18} aria-hidden="true" />
                ) : (
                  <Play size={18} aria-hidden="true" />
                )}
              </IconButton>
              {frameStep && (
                <>
                  <IconButton
                    label="Previous frame"
                    aria-keyshortcuts=","
                    variant="ghost"
                    onClick={() => stepFrame(-1)}
                  >
                    <StepBack size={18} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Next frame"
                    aria-keyshortcuts="."
                    variant="ghost"
                    onClick={() => stepFrame(1)}
                  >
                    <StepForward size={18} aria-hidden="true" />
                  </IconButton>
                </>
              )}
              <IconButton
                label="Previous save or load"
                aria-keyshortcuts="P"
                variant="ghost"
                onClick={() => jump(-1)}
              >
                <SkipBack size={18} aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Next save or load"
                aria-keyshortcuts="N"
                variant="ghost"
                onClick={() => jump(1)}
              >
                <SkipForward size={18} aria-hidden="true" />
              </IconButton>
              <Levels
                brightness={preferences.brightness}
                soundAvailable={soundAvailable}
                volume={preferences.volume}
                onBrightnessChange={(brightness) => setPreference("brightness", brightness)}
                onVolumeChange={changeVolume}
                onToggleMute={toggleMute}
              />
              <span className="cjs-replay-player__clock">
                {formatReplayClock(time - start)} <span aria-hidden="true">/</span>
                <VisuallyHidden> of </VisuallyHidden> {formatReplayClock(span)}
              </span>
            </div>

            <div className="cjs-replay-player__options">
              <Select
                label="Speed"
                value={String(speed)}
                onChange={(event) => changeSpeed(Number(event.currentTarget.value))}
              >
                {PLAYBACK_SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </Select>
              <Button
                aria-keyshortcuts="C"
                aria-pressed={!follow}
                size="small"
                variant="secondary"
                onClick={toggleFollow}
              >
                <Move3d size={16} aria-hidden="true" />
                Free camera
              </Button>
              <Button
                aria-keyshortcuts="T"
                aria-pressed={mode === "cinema"}
                size="small"
                variant="secondary"
                onClick={() => toggleMode("cinema")}
              >
                <RectangleHorizontal size={16} aria-hidden="true" />
                Cinema
              </Button>
              <IconButton
                label={mode === "fullscreen" ? "Exit full screen" : "Full screen"}
                aria-keyshortcuts="F"
                size="small"
                variant="secondary"
                onClick={() => toggleMode("fullscreen")}
              >
                {mode === "fullscreen" ? (
                  <Minimize size={16} aria-hidden="true" />
                ) : (
                  <Maximize size={16} aria-hidden="true" />
                )}
              </IconButton>
              {tools}
              <IconButton
                label="Share"
                aria-haspopup="dialog"
                size="small"
                variant="secondary"
                onClick={() => {
                  setShareOffset(getTime() - start);
                  shareRef.current?.showModal();
                }}
              >
                <Share size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Keyboard shortcuts"
                aria-keyshortcuts="Shift+?"
                aria-haspopup="dialog"
                size="small"
                variant="secondary"
                onClick={() => shortcutsRef.current?.showModal()}
              >
                <Keyboard size={16} aria-hidden="true" />
              </IconButton>
            </div>

            <div className="cjs-replay-player__timeline">
              {heat.data && preferences.heatmap && <ReplayHeatStrip heat={heat.data} span={span} />}
              <div className="cjs-replay-player__ticks" aria-hidden="true">
                {timelineMarkers.map((marker, index) => (
                  <span
                    key={`${marker.kind}-${marker.t}-${index}`}
                    data-kind={marker.kind}
                    style={{ insetInlineStart: `${((marker.t - start) / span) * 100}%` }}
                  />
                ))}
              </div>
              <input
                type="range"
                className="cjs-replay-player__seek"
                aria-label="Replay position"
                aria-valuetext={`${formatReplayClock(time - start)} of ${formatReplayClock(span)}`}
                min={start}
                max={end}
                step="any"
                value={time}
                onChange={(event) => seek(Number(event.currentTarget.value))}
              />
            </div>

            <ul className="cjs-replay-player__legend" aria-label="Timeline markers">
              {(Object.keys(MARKER_LABELS) as TimelineKind[]).map((kind) => (
                <li key={kind} data-kind={kind}>
                  <span aria-hidden="true" />
                  {MARKER_LABELS[kind]}: {markerCounts[kind]}
                </li>
              ))}
            </ul>

            <HudToggles
              available={available}
              heatNote={
                heat.enabled
                  ? heat.loading && !heat.data
                    ? "loading"
                    : heat.error
                      ? "could not load"
                      : heatReady
                        ? null
                        : "no web views yet"
                  : undefined
              }
              preferences={preferences}
              onChange={setPreference}
              autoSkipStatus={
                available.autoSkip
                  ? `Auto-skip: ${preferences.autoSkip ? "ON" : "OFF"}${skipped > 0 ? ` · Skipped ${skipped} fails` : ""}`
                  : null
              }
            />
          </div>
        )}
      </MapViewer>

      <ShortcutsDialog frameStep={frameStep} ref={shortcutsRef} />
      <ShareDialog
        announce={setAnnouncement}
        offsetMs={shareOffset}
        ref={shareRef}
        runId={samples.run_id}
        search={search}
      />

      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </section>
  );
}

const HUD_TOGGLES: readonly {
  key: HudToggleKey;
  label: string;
  unavailable: string;
}[] = [
  { key: "angleHelper", label: "Anglehelper", unavailable: "not recorded in this replay" },
  { key: "keys", label: "Keys", unavailable: "not recorded in this replay" },
  { key: "speed", label: "Speed", unavailable: "not recorded in this replay" },
  { key: "fps", label: "FPS", unavailable: "unknown for this run" },
  { key: "position", label: "Position", unavailable: "not recorded in this replay" },
  { key: "jumpTimer", label: "Jumptimer", unavailable: "not recorded in this replay" },
  { key: "viewmodel", label: "Draw gun", unavailable: "weapon model unavailable" },
  { key: "crosshair", label: "Crosshair", unavailable: "" },
  { key: "autoSkip", label: "Auto-skip fails", unavailable: "no skip plan in this replay" },
];

/** Volume and brightness, video-player style: an icon and a short slider each. */
function Levels({
  brightness,
  onBrightnessChange,
  onToggleMute,
  onVolumeChange,
  soundAvailable,
  volume,
}: {
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  soundAvailable: boolean;
  volume: number;
}) {
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const volumeText = `${Math.round(volume * 100)}%`;
  const brightnessText = `${Math.round(brightness * 100)}%`;
  return (
    <div className="cjs-replay-player__levels">
      <span className="cjs-replay-player__level">
        <IconButton
          label={!soundAvailable ? "Sound unavailable" : volume === 0 ? "Unmute" : "Mute"}
          aria-keyshortcuts="M"
          disabled={!soundAvailable}
          size="small"
          variant="ghost"
          onClick={onToggleMute}
        >
          <VolumeIcon size={18} aria-hidden="true" />
        </IconButton>
        <input
          type="range"
          aria-label="Volume"
          title={`Volume ${volumeText}`}
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!soundAvailable}
          aria-valuetext={volumeText}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
        />
      </span>
      <label className="cjs-replay-player__level" title={`Brightness ${brightnessText}`}>
        <span className="cjs-replay-player__level-icon">
          <Sun size={18} aria-hidden="true" />
        </span>
        <input
          type="range"
          aria-label="Brightness"
          min={0.5}
          max={2.5}
          step={0.05}
          value={brightness}
          aria-valuetext={brightnessText}
          onChange={(event) => onBrightnessChange(Number(event.currentTarget.value))}
        />
      </label>
    </div>
  );
}

function HudToggles({
  autoSkipStatus,
  available,
  heatNote,
  onChange,
  preferences,
}: {
  autoSkipStatus: string | null;
  available: Readonly<Record<HudToggleKey, boolean>>;
  /** Undefined hides the watch heat toggle (feature off); null means the heat is shown. */
  heatNote: string | null | undefined;
  onChange: (key: HudToggleKey, value: boolean) => void;
  preferences: HudPreferences;
}) {
  return (
    <fieldset className="cjs-replay-player__hud">
      <legend>HUD</legend>
      {HUD_TOGGLES.map(({ key, label, unavailable }) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={available[key] && preferences[key]}
            disabled={!available[key]}
            onChange={(event) => onChange(key, event.currentTarget.checked)}
          />
          {label}
          {!available[key] && <span className="cjs-replay-player__hud-note">({unavailable})</span>}
        </label>
      ))}
      {heatNote !== undefined && (
        <label>
          <input
            type="checkbox"
            checked={available.heatmap && preferences.heatmap}
            disabled={!available.heatmap}
            onChange={(event) => onChange("heatmap", event.currentTarget.checked)}
          />
          Watch heat
          {heatNote && <span className="cjs-replay-player__hud-note">({heatNote})</span>}
        </label>
      )}
      {autoSkipStatus && <span className="cjs-replay-player__auto-skip">{autoSkipStatus}</span>}
    </fieldset>
  );
}

/** The camera's interpolated pose at the feet origin, before the view height (poshud's origin). */
function feetPose(timeline: ReplayTimeline, time: number): CodPose {
  const pose = samplePose(timeline, time);
  return { ...pose, z: pose.z - eyeHeight(timeline, time) };
}
