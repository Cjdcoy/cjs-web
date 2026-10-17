import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUD_PREFERENCES,
  HUD_PREFERENCES_STORAGE_KEY,
  readHudPreferences,
  writeHudPreferences,
} from "./hudPreferences";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(HUD_PREFERENCES_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("replay HUD preferences", () => {
  it("round-trips a versioned document", () => {
    const storage = memoryStorage();
    const preferences = { ...DEFAULT_HUD_PREFERENCES, speed: false, viewmodel: true };
    writeHudPreferences(preferences, storage);

    expect(JSON.parse(storage.getItem(HUD_PREFERENCES_STORAGE_KEY) ?? "")).toMatchObject({
      version: 1,
      speed: false,
    });
    expect(readHudPreferences(storage)).toEqual(preferences);
  });

  it.each([
    ["missing", undefined],
    ["malformed JSON", "{oops"],
    ["another version", JSON.stringify({ version: 2, speed: false })],
    ["a non-object", "42"],
  ])("recovers defaults from %s storage", (_, value) => {
    expect(readHudPreferences(memoryStorage(value))).toEqual(DEFAULT_HUD_PREFERENCES);
  });

  it("keeps an older stored document valid: new toggles default off, the retired scale is dropped", () => {
    const stored = JSON.stringify({ version: 1, angleHelper: true, speed: false, trueAngle: true });
    const preferences = readHudPreferences(memoryStorage(stored));
    expect(preferences).toEqual({ ...DEFAULT_HUD_PREFERENCES, speed: false });
    expect(preferences).toMatchObject({ position: false, jumpTimer: false });
    expect(preferences).not.toHaveProperty("trueAngle");
  });

  it("keeps the volume in range and defaults to half volume", () => {
    expect(DEFAULT_HUD_PREFERENCES.volume).toBe(0.5);
    expect(DEFAULT_HUD_PREFERENCES).not.toHaveProperty("sound");
    const stored = (volume: unknown) => memoryStorage(JSON.stringify({ version: 1, volume }));
    expect(readHudPreferences(stored(0.2)).volume).toBe(0.2);
    expect(readHudPreferences(stored(3)).volume).toBe(1);
    expect(readHudPreferences(stored("loud")).volume).toBe(0.5);
  });

  it("reads the retired sound toggle: off becomes volume 0, on keeps the volume", () => {
    const stored = (sound: boolean) =>
      memoryStorage(JSON.stringify({ version: 1, sound, volume: 0.7 }));
    expect(readHudPreferences(stored(false)).volume).toBe(0);
    expect(readHudPreferences(stored(true)).volume).toBe(0.7);
    expect(readHudPreferences(stored(false))).not.toHaveProperty("sound");
  });

  it("shows the crosshair by default, also for documents stored before it existed", () => {
    expect(DEFAULT_HUD_PREFERENCES.crosshair).toBe(true);
    const stored = (crosshair?: boolean) =>
      memoryStorage(JSON.stringify({ version: 1, crosshair }));
    expect(readHudPreferences(stored()).crosshair).toBe(true);
    expect(readHudPreferences(stored(false)).crosshair).toBe(false);
  });

  it("defaults brightness to 130% for older documents and keeps it in range", () => {
    const stored = (brightness?: unknown) =>
      memoryStorage(JSON.stringify({ version: 1, speed: true, brightness }));
    expect(readHudPreferences(stored()).brightness).toBe(1.3);
    expect(readHudPreferences(stored(2)).brightness).toBe(2);
    expect(readHudPreferences(stored(9)).brightness).toBe(2.5);
    expect(readHudPreferences(stored(0.1)).brightness).toBe(0.5);
  });

  it("keeps valid fields and defaults the rest", () => {
    const stored = JSON.stringify({ version: 1, fps: false, autoSkip: "no" });
    expect(readHudPreferences(memoryStorage(stored))).toEqual({
      ...DEFAULT_HUD_PREFERENCES,
      fps: false,
    });
  });

  it("survives storage that throws", () => {
    const blocked = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    };
    expect(readHudPreferences(blocked)).toEqual(DEFAULT_HUD_PREFERENCES);
    expect(() => writeHudPreferences(DEFAULT_HUD_PREFERENCES, blocked)).not.toThrow();
  });
});
