import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  type CjsApi,
  type Fps,
  type PlayerActivitySummary,
  type PlayerLeaderboard,
  type PlayerLeaderboardPosition,
  type PlayerJumpScores,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type Source,
} from "../../lib/api";
import type { PlayerProfileView } from "./playerProfileModel";

export type PlayerProfileApi = Pick<
  CjsApi,
  | "playerActivitySummary"
  | "playerLeaderboardPositions"
  | "playerJumpScores"
  | "playerPerformance"
  | "playerRank"
  | "playerRoutes"
>;

export type ProfileResourceStatus = "error" | "loading" | "refreshing" | "success" | "unsupported";

export interface ProfileResourceError {
  message: string;
  status?: number;
}

export interface ProfileResource<Data> {
  data: Data | null;
  error: ProfileResourceError | null;
  status: ProfileResourceStatus;
}

export interface PlayerProfileResources {
  activity: ProfileResource<PlayerActivitySummary>;
  performance: ProfileResource<PlayerPerformanceStats>;
  positions: ProfileResource<PlayerLeaderboardPosition[]>;
  rank: ProfileResource<PlayerRankInfo>;
  routes: ProfileResource<PlayerRouteCompletion[]>;
  scores: ProfileResource<PlayerJumpScores>;
}

interface UsePlayerProfileOptions {
  apiClient?: PlayerProfileApi;
  board: PlayerLeaderboard;
  fps: Fps;
  playerId: number;
  source: Source;
  view: PlayerProfileView;
}

type ResourceKind = keyof PlayerProfileResources;

interface ResourceDataMap {
  activity: PlayerActivitySummary;
  performance: PlayerPerformanceStats;
  positions: PlayerLeaderboardPosition[];
  rank: PlayerRankInfo;
  routes: PlayerRouteCompletion[];
  scores: PlayerJumpScores;
}

interface ResourceState<Data> extends ProfileResource<Data> {
  requestKey: string;
}

export function usePlayerProfile({
  apiClient = api,
  board,
  fps,
  playerId,
  source,
  view,
}: UsePlayerProfileOptions): PlayerProfileResources & { reload: () => void } {
  const [reloadVersion, setReloadVersion] = useState(0);
  const baseKey = `${source}:${playerId}`;
  const options = useMemo(() => ({ board, fps, playerId, source }), [board, fps, playerId, source]);

  const performance = useProfileResource(
    "performance",
    `${baseKey}:performance`,
    view === "overview",
    apiClient,
    options,
    reloadVersion,
  );
  const positions = useProfileResource(
    "positions",
    `${baseKey}:positions:${fps}:${board}`,
    view === "overview",
    apiClient,
    options,
    reloadVersion,
  );
  const scores = useProfileResource(
    "scores",
    `${baseKey}:scores:${fps}`,
    view === "runs",
    apiClient,
    options,
    reloadVersion,
  );
  const routes = useProfileResource(
    "routes",
    `${baseKey}:routes`,
    view === "routes",
    apiClient,
    options,
    reloadVersion,
  );
  const rank = useProfileResource(
    "rank",
    `${baseKey}:rank`,
    source === "j4l" && view === "overview",
    apiClient,
    options,
    reloadVersion,
  );
  const activity = useProfileResource(
    "activity",
    `${baseKey}:activity`,
    source === "j4l" && view === "overview",
    apiClient,
    options,
    reloadVersion,
  );
  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  return { activity, performance, positions, rank, reload, routes, scores };
}

function useProfileResource<Kind extends ResourceKind>(
  kind: Kind,
  requestKey: string,
  enabled: boolean,
  apiClient: PlayerProfileApi,
  options: {
    board: PlayerLeaderboard;
    fps: Fps;
    playerId: number;
    source: Source;
  },
  reloadVersion: number,
): ProfileResource<ResourceDataMap[Kind]> {
  const [state, setState] = useState<ResourceState<ResourceDataMap[Kind]>>(() => ({
    data: null,
    error: null,
    requestKey,
    status: enabled ? "loading" : "unsupported",
  }));

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, requestKey, status: "unsupported" });
      return;
    }

    const controller = new AbortController();
    setState((current) => {
      const canRefresh = current.requestKey === requestKey && current.data !== null;
      return {
        data: canRefresh ? current.data : null,
        error: null,
        requestKey,
        status: canRefresh ? "refreshing" : "loading",
      };
    });

    void loadResource(kind, apiClient, options, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, error: null, requestKey, status: "success" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.requestKey === requestKey ? current.data : null,
          error: profileResourceError(reason),
          requestKey,
          status: "error",
        }));
      });

    return () => controller.abort();
  }, [apiClient, enabled, kind, options, reloadVersion, requestKey]);

  if (state.requestKey !== requestKey) {
    return { data: null, error: null, status: enabled ? "loading" : "unsupported" };
  }

  return { data: state.data, error: state.error, status: state.status };
}

function loadResource<Kind extends ResourceKind>(
  kind: Kind,
  apiClient: PlayerProfileApi,
  options: {
    board: PlayerLeaderboard;
    fps: Fps;
    playerId: number;
    source: Source;
  },
  signal: AbortSignal,
): Promise<ResourceDataMap[Kind]> {
  const context = {
    playerId: options.playerId,
    signal,
    source: options.source,
  };

  switch (kind) {
    case "activity":
      return apiClient.playerActivitySummary(context) as Promise<ResourceDataMap[Kind]>;
    case "performance":
      return apiClient.playerPerformance(context) as Promise<ResourceDataMap[Kind]>;
    case "positions":
      return apiClient.playerLeaderboardPositions({
        ...context,
        fps: options.fps,
        leaderboard: options.board,
      }) as Promise<ResourceDataMap[Kind]>;
    case "rank":
      return apiClient.playerRank(context) as Promise<ResourceDataMap[Kind]>;
    case "routes":
      return apiClient.playerRoutes(context) as Promise<ResourceDataMap[Kind]>;
    case "scores":
      return apiClient.playerJumpScores({
        ...context,
        fps: options.fps,
      }) as Promise<ResourceDataMap[Kind]>;
  }
}

function profileResourceError(reason: unknown): ProfileResourceError {
  if (reason instanceof ApiError) {
    return { message: reason.message, status: reason.status };
  }
  return {
    message:
      reason instanceof Error ? reason.message : "The profile request could not be completed.",
  };
}
