import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Player, type Source } from "../../lib/api";
import {
  PLAYER_SEARCH_DEBOUNCE_MS,
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_MIN_LENGTH,
} from "./playerDiscovery";

type SearchPlayers = typeof api.searchPlayers;
type ListPlayers = typeof api.players;

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
  listPlayers?: ListPlayers;
  query: string;
  searchPlayers?: SearchPlayers;
  sort?: "last-seen" | "name" | "visits";
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
  listPlayers = api.players,
  query,
  searchPlayers = api.searchPlayers,
  sort = "last-seen",
  source,
}: UsePlayerSearchOptions): PlayerSearchResult {
  const normalizedQuery = query.trim();
  const isSearch = normalizedQuery.length >= PLAYER_SEARCH_MIN_LENGTH;
  const directorySort = !isSearch && sort === "visits" ? "visits" : "last-seen";
  const requestKey = isSearch
    ? `search\u0000${source}\u0000${normalizedQuery}`
    : `directory\u0000${source}\u0000${directorySort}`;
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PlayerSearchState>(initialState);
  const previousRequestKey = useRef("");

  useEffect(() => {
    const isRetry = previousRequestKey.current === requestKey;
    previousRequestKey.current = requestKey;
    const controller = new AbortController();
    const delay = isSearch && !isRetry ? debounceMs : 0;

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

      const request = isSearch
        ? searchPlayers({
            limit: PLAYER_SEARCH_LIMIT,
            name: normalizedQuery,
            signal: controller.signal,
            source,
          })
        : listPlayers({
            signal: controller.signal,
            sort: directorySort,
            source,
          });

      void request
        .then((players) => {
          if (controller.signal.aborted) return;
          setState({ error: null, players, requestKey, status: "success" });
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            ...current,
            error: reason instanceof Error ? reason.message : "The player request failed.",
            requestKey,
            status: "error",
          }));
        });
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    debounceMs,
    directorySort,
    isSearch,
    listPlayers,
    normalizedQuery,
    requestKey,
    retryVersion,
    searchPlayers,
    source,
  ]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  return useMemo(() => {
    if (state.requestKey === requestKey) {
      return { error: state.error, players: state.players, retry, status: state.status };
    }

    return {
      error: null,
      players: [],
      retry,
      status: isSearch && debounceMs > 0 ? ("debouncing" as const) : ("loading" as const),
    };
  }, [debounceMs, isSearch, requestKey, retry, state]);
}
