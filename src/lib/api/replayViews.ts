import { buildApiUrl } from "./client";

export const REPLAY_VIEWS_PATH = "/api/v1/replay/views";

/** Build-time switch for web replay-view collection and its read UI (ADR 0005). */
export function isReplayViewAnalyticsEnabled(): boolean {
  return import.meta.env.VITE_REPLAY_VIEW_ANALYTICS === "1";
}

type BeaconNavigator = Partial<Pick<Navigator, "sendBeacon">>;

/**
 * Posts one serialized view flush as `text/plain`, a CORS "simple" request with no preflight.
 * The response is never read, so nothing about it (or the body) is logged.
 */
export function sendReplayView(
  baseUrl: string,
  body: string,
  browser: BeaconNavigator = globalThis.navigator,
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): void {
  const url = buildApiUrl(baseUrl, REPLAY_VIEWS_PATH);
  try {
    if (browser?.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {
    // Some browsers throw for oversized or blocked beacons; fall back to fetch.
  }
  void fetchImpl?.(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "text/plain" },
    keepalive: true,
    mode: "no-cors",
  }).catch(() => undefined);
}
