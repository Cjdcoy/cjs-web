import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Source } from "../../lib/api";

type ListPlayerRanks = typeof api.rankXpLeaderboard;

export type PlayerLevelsStatus = "idle" | "loading" | "success" | "error";

export interface PlayerLevelsResult {
  error: string | null;
  levelXp: ReadonlyMap<number, number>;
  levels: ReadonlyMap<number, string>;
  retry: () => void;
  status: PlayerLevelsStatus;
}

interface PlayerLevelsState {
  error: string | null;
  levelXp: ReadonlyMap<number, number>;
  levels: ReadonlyMap<number, string>;
  source: Source | null;
  status: PlayerLevelsStatus;
}

const emptyLevels = new Map<number, string>();
const emptyLevelXp = new Map<number, number>();
const initialState: PlayerLevelsState = {
  error: null,
  levelXp: emptyLevelXp,
  levels: emptyLevels,
  source: null,
  status: "idle",
};

export function usePlayerLevels({
  listPlayerRanks = api.rankXpLeaderboard,
  source,
}: {
  listPlayerRanks?: ListPlayerRanks;
  source: Source;
}): PlayerLevelsResult {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PlayerLevelsState>(initialState);

  useEffect(() => {
    if (source !== "j4l") {
      setState({
        error: null,
        levelXp: emptyLevelXp,
        levels: emptyLevels,
        source,
        status: "idle",
      });
      return;
    }

    const controller = new AbortController();
    setState({
      error: null,
      levelXp: emptyLevelXp,
      levels: emptyLevels,
      source,
      status: "loading",
    });

    void listPlayerRanks({ signal: controller.signal, source })
      .then((ranks) => {
        if (controller.signal.aborted) return;
        const levels = new Map(
          ranks.map(
            (rank) => [rank.player_id, rank.level_display.trim() || String(rank.level)] as const,
          ),
        );
        const levelXp = new Map(ranks.map((rank) => [rank.player_id, rank.total_xp] as const));
        setState({ error: null, levelXp, levels, source, status: "success" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          error: reason instanceof Error ? reason.message : "The player level request failed.",
          levelXp: emptyLevelXp,
          levels: emptyLevels,
          source,
          status: "error",
        });
      });

    return () => controller.abort();
  }, [listPlayerRanks, retryVersion, source]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  return useMemo(() => {
    if (state.source === source) {
      return {
        error: state.error,
        levelXp: state.levelXp,
        levels: state.levels,
        retry,
        status: state.status,
      };
    }

    return {
      error: null,
      levelXp: emptyLevelXp,
      levels: emptyLevels,
      retry,
      status: source === "j4l" ? ("loading" as const) : ("idle" as const),
    };
  }, [retry, source, state]);
}
