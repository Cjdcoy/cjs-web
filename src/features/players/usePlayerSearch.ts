import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Player, type Source } from "../../lib/api";
import {
  PLAYER_SEARCH_DEBOUNCE_MS,
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_MIN_LENGTH,
} from "./playerDiscovery";

type SearchPlayers = typeof api.searchPlayers;

export type PlayerSearchStatus =
  "idle" | "debouncing" | "loading" | "refreshing" | "success" | "error";

export interface PlayerSearchResult {
  error: string | null;
  players: Player[];
  retry: () => void;
  status: PlayerSearchStatus;
}

interface PlayerSearchState {
  error: string | null;
  players: Player[];
  requestKey: string;
  status: PlayerSearchStatus;
}

interface UsePlayerSearchOptions {
  debounceMs?: number;
  query: string;
  searchPlayers?: SearchPlayers;
  source: Source;
}

const initialState: PlayerSearchState = {
  error: null,
  players: [],
  requestKey: "",
  status: "idle",
};

export function usePlayerSearch({
  debounceMs = PLAYER_SEARCH_DEBOUNCE_MS,
  query,
  searchPlayers = api.searchPlayers,
  source,
}: UsePlayerSearchOptions): PlayerSearchResult {
  const normalizedQuery = query.trim();
  const requestKey = `${source}\u0000${normalizedQuery}`;
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PlayerSearchState>(initialState);
  const previousRequestKey = useRef("");

  useEffect(() => {
    if (normalizedQuery.length < PLAYER_SEARCH_MIN_LENGTH) {
      previousRequestKey.current = requestKey;
      setState({ ...initialState, requestKey });
      return;
    }

    const isRetry = previousRequestKey.current === requestKey;
    previousRequestKey.current = requestKey;
    const controller = new AbortController();
    const delay = isRetry ? 0 : debounceMs;

    setState((current) => ({
      error: null,
      players: current.requestKey === requestKey ? current.players : [],
      requestKey,
      status:
        current.requestKey === requestKey && current.players.length > 0
          ? "refreshing"
          : delay > 0
            ? "debouncing"
            : "loading",
    }));

    const timeout = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        status: current.players.length > 0 ? "refreshing" : "loading",
      }));

      void searchPlayers({
        limit: PLAYER_SEARCH_LIMIT,
        name: normalizedQuery,
        signal: controller.signal,
        source,
      })
        .then((players) => {
          if (controller.signal.aborted) return;
          setState({ error: null, players, requestKey, status: "success" });
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            ...current,
            error: reason instanceof Error ? reason.message : "The player search failed.",
            requestKey,
            status: "error",
          }));
        });
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [debounceMs, normalizedQuery, requestKey, retryVersion, searchPlayers, source]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  return useMemo(() => {
    if (state.requestKey === requestKey) {
      return { error: state.error, players: state.players, retry, status: state.status };
    }

    return {
      error: null,
      players: [],
      retry,
      status: normalizedQuery.length < PLAYER_SEARCH_MIN_LENGTH ? "idle" : ("debouncing" as const),
    };
  }, [normalizedQuery.length, requestKey, retry, state]);
}
