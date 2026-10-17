/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_MODEL_BASE_URL?: string;
  /** "1" turns on web replay-view analytics (ADR 0005). */
  readonly VITE_REPLAY_VIEW_ANALYTICS?: string;
}
