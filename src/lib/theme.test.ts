import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_PREFERENCE,
  THEMES,
  THEME_STORAGE_KEY,
  applyTheme,
  initializeTheme,
  isThemeId,
  readStoredPreference,
  resolveTheme,
  storePreference,
} from "./theme";

function createStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, value),
  } satisfies Storage;
}

describe("theme", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recognises only published theme ids", () => {
    for (const theme of THEMES) expect(isThemeId(theme.id)).toBe(true);
    expect(isThemeId("solarized")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it("falls back to the default preference when nothing valid is stored", () => {
    expect(readStoredPreference()).toBe(DEFAULT_THEME_PREFERENCE);
    localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(readStoredPreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });

  it("gives a first-time visitor Jade whichever source they land on", () => {
    for (const source of ["jh", "j4l"]) {
      expect(resolveTheme(readStoredPreference(), source)).toBe("jade");
    }
  });

  it("round-trips a stored preference and puts the theme on the document element", () => {
    storePreference("cobalt");
    expect(readStoredPreference()).toBe("cobalt");
    expect(initializeTheme()).toBe("cobalt");
    expect(document.documentElement.dataset.theme).toBe("cobalt");

    applyTheme("ember");
    expect(document.documentElement.dataset.theme).toBe("ember");
  });

  it("matches the source only while the preference is auto", () => {
    expect(resolveTheme("auto", "jh")).toBe("cobalt");
    expect(resolveTheme("auto", "j4l")).toBe("jade");
    expect(resolveTheme("auto", "unknown")).toBe(DEFAULT_THEME);
    expect(resolveTheme("ember", "jh")).toBe("ember");
  });

  it("resolves auto from the URL source when the app boots", () => {
    storePreference("auto");
    window.history.replaceState(null, "", "/leaderboards?source=j4l");
    expect(initializeTheme()).toBe("jade");
    window.history.replaceState(null, "", "/leaderboards?source=jh");
    expect(initializeTheme()).toBe("cobalt");
  });

  it("keeps working when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      get length() {
        return 0;
      },
      clear: () => undefined,
      getItem: () => {
        throw new Error("storage disabled");
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("storage disabled");
      },
    } satisfies Storage);

    expect(readStoredPreference()).toBe(DEFAULT_THEME_PREFERENCE);
    expect(() => storePreference("ember")).not.toThrow();
  });
});
