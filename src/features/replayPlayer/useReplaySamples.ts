import { useCallback } from "react";
import { api, ApiError, type CjsApi, type ReplaySamples } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";

export type ReplaySamplesApi = Pick<CjsApi, "replaySamples">;

/** Expected outcomes of a replay request; other failures surface as errors. */
export type ReplayLoad =
  { kind: "ready"; samples: ReplaySamples } | { kind: "unavailable" } | { kind: "unsupported" };

export function useReplaySamples(runId: number, apiClient: ReplaySamplesApi = api) {
  const loader = useCallback(
    async (signal: AbortSignal): Promise<ReplayLoad> => {
      try {
        const samples = await apiClient.replaySamples({ runId, signal, source: "j4l" });
        return { kind: "ready", samples };
      } catch (error) {
        // 404: not archived (yet); 400: not a J4L run. 422: recorded in an unsupported format.
        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
          return { kind: "unavailable" };
        }
        if (error instanceof ApiError && error.status === 422) return { kind: "unsupported" };
        throw error;
      }
    },
    [apiClient, runId],
  );

  return useAsync(loader, `replay:${runId}`);
}
