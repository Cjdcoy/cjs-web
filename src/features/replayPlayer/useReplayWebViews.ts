import { useCallback } from "react";
import { api, type CjsApi, type ReplayViewCounts, type ReplayWebViewHeat } from "../../lib/api";
import { isReplayViewAnalyticsEnabled } from "../../lib/api/replayViews";
import { useAsync } from "../../lib/useAsync";

export type ReplayWebViewsApi = Pick<CjsApi, "replayViewCounts" | "replayWebViewSummary">;

/** Web and in-game view counts of one run; data is null while the feature is off. */
export function useReplayViewCounts(runId: number, apiClient: ReplayWebViewsApi = api) {
  const enabled = isReplayViewAnalyticsEnabled();
  const loader = useCallback(
    async (signal: AbortSignal): Promise<ReplayViewCounts | null> => {
      if (!enabled) return null;
      const counts = await apiClient.replayViewCounts({ runIds: [runId], signal, source: "j4l" });
      return counts.get(runId) ?? { web: 0, in_game: 0 };
    },
    [apiClient, enabled, runId],
  );
  return { enabled, ...useAsync(loader, `replay-view-counts:${runId}:${enabled}`) };
}

/** The web watch heat of one run; data is null while the feature is off. */
export function useReplayHeat(runId: number, apiClient: ReplayWebViewsApi = api) {
  const enabled = isReplayViewAnalyticsEnabled();
  const loader = useCallback(
    async (signal: AbortSignal): Promise<ReplayWebViewHeat | null> =>
      enabled
        ? (await apiClient.replayWebViewSummary({ runId, signal, source: "j4l" })).heat
        : null,
    [apiClient, enabled, runId],
  );
  return { enabled, ...useAsync(loader, `replay-heat:${runId}:${enabled}`) };
}
