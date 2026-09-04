/**
 * Global colour themes.
 *
 * A theme is a block of base colours in `styles/tokens.css` selected by a
 * `data-theme` attribute on the document element. Everything else in the token
 * set is either shared or derived, so this module only has to remember which
 * theme is active and put the attribute in place.
 */

export const THEME_STORAGE_KEY = "cjs.theme";

export const THEMES = [
  { id: "jade", label: "Jade" },
  { id: "ember", label: "Ember" },
  { id: "cobalt", label: "Cobalt" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "jade";

/**
 * "auto" follows the selected data source so each community keeps its own
 * colour; the remaining preferences pin one theme regardless of source.
 */
export const THEME_PREFERENCES = [{ id: "auto", label: "Match source" }, ...THEMES] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number]["id"];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "auto";

const SOURCE_THEMES = { j4l: "jade", jh: "cobalt" } as const satisfies Record<string, ThemeId>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference.id === value);
}

/** The theme a preference resolves to for the source currently being viewed. */
export function resolveTheme(preference: ThemePreference, source: string): ThemeId {
  if (preference !== "auto") return preference;
  return SOURCE_THEMES[source as keyof typeof SOURCE_THEMES] ?? DEFAULT_THEME;
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored preference, or the default when nothing valid is stored. */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = safeStorage()?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    safeStorage()?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A viewer with storage disabled still gets the theme for this page view.
  }
}

/** Puts the theme on the document element so the token blocks take effect. */
export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

/**
 * Applies the stored preference before the app renders. The source is read
 * straight from the URL because routing has not mounted this early.
 */
export function initializeTheme(): ThemeId {
  const theme = resolveTheme(readStoredPreference(), readSourceFromLocation());
  applyTheme(theme);
  return theme;
}

function readSourceFromLocation(): string {
  try {
    return new URLSearchParams(window.location.search).get("source") ?? "jh";
  } catch {
    return "jh";
  }
}
