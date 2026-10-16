import { useCallback, useEffect, useState, type RefObject } from "react";

/** Cinema keeps the controls below the view; full screen lays them over it and hides them when idle. */
export type ViewMode = "normal" | "cinema" | "fullscreen";

const CONTROLS_IDLE_MS = 2_500;
const CONTROLS = ".cjs-replay-player__controls";
/** Full-screen controls stay up while the bar is hovered or Layers or a dialog is open. */
const KEEP_CONTROLS = `${CONTROLS}:hover, [aria-expanded='true'], dialog[open]`;

/**
 * Cinema and full screen both put `target` in browser full screen, or where the Fullscreen API is
 * unavailable (iPhone Safari, some iframes) in a fixed in-page overlay that Esc leaves. Switching
 * between them stays in browser full screen, and leaving it (Esc, browser UI) returns to the page.
 */
export function useViewMode(target: RefObject<HTMLElement | null>) {
  const [mode, setModeState] = useState<ViewMode>("normal");
  const [idle, setIdle] = useState(false);
  const fullscreenSupported =
    typeof document !== "undefined" &&
    document.fullscreenEnabled === true &&
    typeof HTMLElement.prototype.requestFullscreen === "function";

  useEffect(() => {
    const element = target.current;
    const onChange = () => {
      if (document.fullscreenElement !== element) setModeState("normal");
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (element && document.fullscreenElement === element) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [target]);

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next);
      // Full screen starts with its controls hidden.
      setIdle(next === "fullscreen");
      const element = target.current;
      if (!fullscreenSupported || !element) return;
      const active = document.fullscreenElement === element;
      // A refused request (no user activation, permissions policy) keeps the in-page overlay.
      if (next === "normal" && active) void document.exitFullscreen().catch(() => undefined);
      if (next !== "normal" && !active) void element.requestFullscreen().catch(() => undefined);
    },
    [fullscreenSupported, target],
  );

  useEffect(() => {
    const root = target.current;
    if (mode !== "fullscreen" || !root) return undefined;
    let timer = 0;
    // Only focus that arrived by keyboard holds the bar: Chrome also marks a clicked button
    // :focus-visible once a shortcut key is pressed, which would pin the bar open.
    let keyboardFocus = false;
    const held = () =>
      root.querySelector(KEEP_CONTROLS) !== null ||
      (keyboardFocus && document.activeElement?.closest(CONTROLS) != null);
    const hideLater = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (held()) hideLater();
        else setIdle(true);
      }, CONTROLS_IDLE_MS);
    };
    const wake = (event: Event) => {
      // Mouse look in the free camera moves a locked pointer; that is not asking for the controls.
      if (event.type === "pointermove" && document.pointerLockElement) return;
      if (event.type === "focusin") {
        keyboardFocus = event.target instanceof Element && event.target.matches(":focus-visible");
      }
      setIdle(false);
      hideLater();
    };
    const events = ["pointermove", "pointerdown", "focusin"] as const;
    for (const type of events) root.addEventListener(type, wake);
    return () => {
      window.clearTimeout(timer);
      for (const type of events) root.removeEventListener(type, wake);
    };
  }, [mode, target]);

  return { mode, setMode, controlsHidden: mode === "fullscreen" && idle };
}
