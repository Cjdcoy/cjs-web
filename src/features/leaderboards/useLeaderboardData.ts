import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type Fps,
  type LeaderboardEntry,
  type RankLeaderboardEntry,
  type Source,
} from "../../lib/api";
import { requestedFps, type LeaderboardBoard } from "./leaderboardModel";

export type LeaderboardData = LeaderboardEntry[] | RankLeaderboardEntry[];

interface LeaderboardRequest {
  board: LeaderboardBoard;
  fps: Fps;
  source: Source;
}

interface LeaderboardRequestState {
  data: LeaderboardData | null;
  error: Error | null;
  key: string | null;
  loading: boolean;
}

export function useLeaderboardData({ board, fps, source }: LeaderboardRequest) {
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestKey = `${source}:${board}:${requestedFps(board, fps) ?? "all"}`;
  const [state, setState] = useState<LeaderboardRequestState>({
    data: null,
    error: null,
    key: null,
    loading: true,
  });

  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({
      data: current.key === requestKey ? current.data : null,
      error: null,
      key: requestKey,
      loading: true,
    }));

    loadLeaderboard({ board, fps, source, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, error: null, key: requestKey, loading: false });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const error =
          reason instanceof Error ? reason : new Error("The leaderboard request failed.");
        setState((current) => ({ ...current, error, loading: false }));
      });

    return () => controller.abort();
  }, [board, fps, reloadVersion, requestKey, source]);

  return useMemo(() => {
    const isCurrentRequest = state.key === requestKey;
    const data = isCurrentRequest ? state.data : null;
    const loading = !isCurrentRequest || state.loading;

    return {
      data,
      error: isCurrentRequest ? state.error : null,
      loading,
      isInitialLoading: loading && data === null,
      isRefreshing: loading && data !== null,
      reload,
    };
  }, [reload, requestKey, state]);
}

async function loadLeaderboard({
  board,
  fps,
  signal,
  source,
}: LeaderboardRequest & { signal: AbortSignal }): Promise<LeaderboardData> {
  if (board === "rank-xp") {
    return api.rankXpLeaderboard({ source, signal });
  }

  return api.leaderboard({
    source,
    signal,
    kind: board,
    fps: requestedFps(board, fps),
  });
}
