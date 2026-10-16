import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type CjsApi,
  type ReplayWatchAggregate,
  type ReplayWatchRankingEntry,
  type ReplayWatchScope,
  type ReplayWebViewAggregate,
  type Source,
} from "../../lib/api";

/** In-game watches (`run_replay_watch_*`) or web player views (`run_replay_web_*`, ADR 0005). */
export type ReplayAudience = "in-game" | "web";

/** Without the web methods, the web side uses the shared API client. */
export type ReplayAnalyticsApi = Pick<CjsApi, "replayWatchAggregate" | "replayWatchRankings"> &
  Partial<Pick<CjsApi, "replayWebViewAggregate" | "replayWebViewRankings">>;

/** Web aggregates add the average completion. */
export type ReplayAudienceAggregate = ReplayWatchAggregate &
  Partial<Pick<ReplayWebViewAggregate, "avg_completion">>;

export type ReplayResourceStatus = "error" | "loading" | "refreshing" | "success" | "unsupported";

export interface ReplayResource<Data> {
  data: Data | null;
  status: ReplayResourceStatus;
}

interface ReplayResourceState<Data> extends ReplayResource<Data> {
  key: string;
}

export interface ReplayAnalyticsResources {
  aggregate: ReplayResource<ReplayAudienceAggregate>;
  rankings: ReplayResource<ReplayWatchRankingEntry[]>;
  reload: () => void;
}

export function useReplayAnalytics({
  apiClient = api,
  audience = "in-game",
  scope,
  source,
}: {
  apiClient?: ReplayAnalyticsApi;
  audience?: ReplayAudience;
  scope: ReplayWatchScope;
  source: Source;
}): ReplayAnalyticsResources {
  const [reloadVersion, setReloadVersion] = useState(0);
  const enabled = source === "j4l";
  const ownerPlayerId = scope.ownerPlayerId;
  const mapId = scope.mapId;
  const web = audience === "web";
  // The web side shows only its most watched run.
  const rankingLimit = ownerPlayerId === undefined || web ? 1 : 5;
  const scopeKey = `${audience}:owner:${ownerPlayerId ?? "all"}:map:${mapId ?? "all"}`;
  const requestScope = useMemo<ReplayWatchScope>(
    () =>
      ownerPlayerId !== undefined
        ? { ownerPlayerId, ...(mapId === undefined ? {} : { mapId }) }
        : { mapId: mapId as number },
    [mapId, ownerPlayerId],
  );
  const loadAggregate = useCallback(
    (signal: AbortSignal): Promise<ReplayAudienceAggregate> =>
      web
        ? (apiClient.replayWebViewAggregate?.({ ...requestScope, signal, source }) ??
          api.replayWebViewAggregate({ ...requestScope, signal, source }))
        : apiClient.replayWatchAggregate({ ...requestScope, signal, source }),
    [apiClient, requestScope, source, web],
  );
  const loadRankings = useCallback(
    (signal: AbortSignal) => {
      const options = {
        ...requestScope,
        limit: rankingLimit,
        metric: "watch_count" as const,
        offset: 0,
        signal,
        source,
      };
      return web
        ? (apiClient.replayWebViewRankings?.(options) ?? api.replayWebViewRankings(options))
        : apiClient.replayWatchRankings(options);
    },
    [apiClient, rankingLimit, requestScope, source, web],
  );
  const aggregate = useReplayResource(
    `${source}:${scopeKey}:aggregate`,
    enabled,
    reloadVersion,
    loadAggregate,
  );
  const rankings = useReplayResource(
    `${source}:${scopeKey}:rankings`,
    enabled,
    reloadVersion,
    loadRankings,
  );
  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  return { aggregate, rankings, reload };
}

function useReplayResource<Data>(
  key: string,
  enabled: boolean,
  reloadVersion: number,
  loader: (signal: AbortSignal) => Promise<Data>,
): ReplayResource<Data> {
  const [state, setState] = useState<ReplayResourceState<Data>>({
    data: null,
    key,
    status: enabled ? "loading" : "unsupported",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, key, status: "unsupported" });
      return;
    }

    const controller = new AbortController();
    setState((current) => {
      const data = current.key === key ? current.data : null;
      return {
        data,
        key,
        status: data === null ? "loading" : "refreshing",
      };
    });

    void loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, key, status: "success" });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.key === key ? current.data : null,
          key,
          status: "error",
        }));
      });

    return () => controller.abort();
  }, [enabled, key, loader, reloadVersion]);

  if (state.key !== key) {
    return { data: null, status: enabled ? "loading" : "unsupported" };
  }
  return { data: state.data, status: state.status };
}
