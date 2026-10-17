import { useCallback, useState } from "react";

export const HUD_PREFERENCES_STORAGE_KEY = "cjs.replay-hud";
const HUD_PREFERENCES_VERSION = 1;

/** Replay overlay and playback toggles, remembered per browser. */
export interface HudPreferences {
  angleHelper: boolean;
  keys: boolean;
  speed: boolean;
  fps: boolean;
  /** poshud: feet origin and view angles, top left. */
  position: boolean;
  jumpTimer: boolean;
  autoSkip: boolean;
  viewmodel: boolean;
  /** The centre mark of the 3D view. */
  crosshair: boolean;
  /** Web watch heat on the timeline (ADR 0005). */
  heatmap: boolean;
  /** Sound volume, 0..1; 0 is muted. */
  volume: number;
  /**
   * Map render display gamma, 0.5..2.5 (the game's r_gamma; above 1 lifts shadows). Values stored
   * when this was a plain multiplier are kept as is: both darken or brighten mid-tones alike.
   */
  brightness: number;
}

/** The on/off preferences, shown as HUD checkboxes. */
export type HudToggleKey = Exclude<keyof HudPreferences, "volume" | "brightness">;

/** Allowed range of each numeric preference. */
const NUMBER_RANGES = { volume: [0, 1], brightness: [0.5, 2.5] } as const;

export const DEFAULT_HUD_PREFERENCES: Readonly<HudPreferences> = {
  angleHelper: true,
  keys: true,
  speed: true,
  fps: true,
  position: false,
  jumpTimer: false,
  // In-game replays auto-skip failed attempts by default.
  autoSkip: true,
  viewmodel: false,
  crosshair: true,
  heatmap: true,
  volume: 0.5,
  brightness: 1.3,
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Stored preferences, falling back to defaults for a missing, malformed, or other-version entry.
 * Fields added since a document was stored take their defaults; retired ones (`trueAngle`) are ignored,
 * except the retired sound toggle: `sound: false` reads as volume 0 so a muted replay stays silent.
 */
export function readHudPreferences(storage = browserStorage()): HudPreferences {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(HUD_PREFERENCES_STORAGE_KEY) ?? "null");
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== HUD_PREFERENCES_VERSION
    ) {
      return { ...DEFAULT_HUD_PREFERENCES };
    }
    const values = parsed as Record<string, unknown>;
    const preferences = { ...DEFAULT_HUD_PREFERENCES };
    for (const key of Object.keys(preferences) as HudToggleKey[]) {
      if (typeof values[key] === "boolean") preferences[key] = values[key];
    }
    for (const [key, [min, max]] of Object.entries(NUMBER_RANGES) as [
      keyof typeof NUMBER_RANGES,
      readonly [number, number],
    ][]) {
      const value = values[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        preferences[key] = Math.min(max, Math.max(min, value));
      }
    }
    if (values.sound === false) preferences.volume = 0;
    return preferences;
  } catch {
    return { ...DEFAULT_HUD_PREFERENCES };
  }
}

export function writeHudPreferences(preferences: HudPreferences, storage = browserStorage()): void {
  try {
    storage?.setItem(
      HUD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: HUD_PREFERENCES_VERSION, ...preferences }),
    );
  } catch {
    // Storage can be full or blocked; the toggles still apply to this page view.
  }
}

export function useHudPreferences() {
  const [preferences, setPreferences] = useState(() => readHudPreferences());
  const setPreference = useCallback(
    <Key extends keyof HudPreferences>(key: Key, value: HudPreferences[Key]) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        writeHudPreferences(next);
        return next;
      });
    },
    [],
  );
  return [preferences, setPreference] as const;
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
