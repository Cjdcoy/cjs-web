import { useCallback } from "react";
import { api, ApiError, type CjsApi, type ReplayMeta, type ReplaySamples } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { ReplayVersionError, v12Samples } from "./replayV12";

export type ReplaySamplesApi = Pick<CjsApi, "replayMeta" | "replayFrames" | "replaySamples">;

/** Expected outcomes of a replay request; other failures surface as errors. */
export type ReplayLoad =
  { kind: "ready"; samples: ReplaySamples } | { kind: "unavailable" } | { kind: "unsupported" };

/**
 * Meta first: v12+ replays are decoded here from their raw frames, older ones come as samples.
 * A meta 404 falls back to samples, whose 404/422 then decide unavailable/unsupported.
 */
export function useReplaySamples(runId: number, apiClient: ReplaySamplesApi = api) {
  const loader = useCallback(
    async (signal: AbortSignal): Promise<ReplayLoad> => {
      const request = { runId, signal, source: "j4l" } as const;
      try {
        const meta = await apiClient.replayMeta(request).catch((error: unknown) => {
          // A backend without the meta route (or no meta row) answers 404: samples decides then.
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        });
        if (!meta || meta.format_version < 12) {
          return { kind: "ready", samples: await apiClient.replaySamples(request) };
        }
        const samples = decode(await apiClient.replayFrames(request), meta);
        return samples ? { kind: "ready", samples } : { kind: "unsupported" };
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

// ponytail: decodes on the main thread (~0.2 s per million frames, so a 10-hour run blocks for
// ~2-3 s); move it to a worker if long replays become common.
/** Null when the file is another replay version (unsupported); corruption is an error. */
function decode(bytes: ArrayBuffer, meta: ReplayMeta): ReplaySamples | null {
  try {
    return v12Samples(new Uint8Array(bytes), meta);
  } catch (cause) {
    if (cause instanceof ReplayVersionError) return null;
    throw new Error("The replay file could not be decoded.", { cause });
  }
}
