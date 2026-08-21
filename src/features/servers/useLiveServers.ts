import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Source } from "../../lib/api";
import {
  InvalidServerDashboardError,
  normalizeServerDashboard,
  type ServerDashboardViewModel,
} from "./serverModel";

export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_STALE_AFTER_MS = 60_000;

export type ServerLoader = (source: Source, signal: AbortSignal) => Promise<unknown>;

export interface LiveServersOptions {
  readonly autoRefresh: boolean;
  readonly loadServers?: ServerLoader;
  readonly pollIntervalMs?: number;
  readonly staleAfterMs?: number;
}

export interface LiveServersState {
  readonly data: ServerDashboardViewModel | null;
  readonly error: string | null;
  readonly initialLoading: boolean;
  readonly lastUpdatedAt: number | null;
  readonly refresh: () => void;
  readonly refreshing: boolean;
  readonly stale: boolean;
}

const loadTrackerServers: ServerLoader = (source, signal) =>
  api.trackerServers({ source, game: "cod2", signal });

export function useLiveServers(
  source: Source,
  {
    autoRefresh,
    loadServers = loadTrackerServers,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
  }: LiveServersOptions,
): LiveServersState {
  const [data, setData] = useState<ServerDashboardViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const activeController = useRef<AbortController | null>(null);
  const activeRequest = useRef(0);
  const dataReference = useRef<ServerDashboardViewModel | null>(null);
  const refreshingReference = useRef(false);

  const request = useCallback(
    async (replaceData: boolean) => {
      activeController.current?.abort();
      const controller = new AbortController();
      activeController.current = controller;
      const requestId = activeRequest.current + 1;
      activeRequest.current = requestId;
      const hasStaleData = !replaceData && dataReference.current !== null;

      if (replaceData) {
        dataReference.current = null;
        setData(null);
        setLastUpdatedAt(null);
      }

      setError(null);
      setInitialLoading(!hasStaleData);
      refreshingReference.current = hasStaleData;
      setRefreshing(hasStaleData);

      try {
        const response = await loadServers(source, controller.signal);
        if (controller.signal.aborted || activeRequest.current !== requestId) return;

        const nextData = normalizeServerDashboard(response);
        const updatedAt = Date.now();
        dataReference.current = nextData;
        setData(nextData);
        setLastUpdatedAt(updatedAt);
        setClock(updatedAt);
        setError(null);
      } catch (cause: unknown) {
        if (controller.signal.aborted || activeRequest.current !== requestId || isAbort(cause)) {
          return;
        }

        setError(describeServerError(cause));
      } finally {
        if (activeRequest.current === requestId) {
          setInitialLoading(false);
          refreshingReference.current = false;
          setRefreshing(false);
        }
      }
    },
    [loadServers, source],
  );

  useEffect(() => {
    void request(true);
    return () => {
      activeRequest.current += 1;
      activeController.current?.abort();
    };
  }, [request]);

  const refresh = useCallback(() => {
    if (refreshingReference.current) return;
    void request(false);
  }, [request]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!autoRefresh || pollIntervalMs <= 0) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, pollIntervalMs);
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        lastUpdatedAt !== null &&
        Date.now() - lastUpdatedAt >= pollIntervalMs
      ) {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, lastUpdatedAt, pollIntervalMs, refresh]);

  const stale =
    data !== null &&
    (error !== null ||
      (lastUpdatedAt !== null && staleAfterMs > 0 && clock - lastUpdatedAt >= staleAfterMs));

  return {
    data,
    error,
    initialLoading,
    lastUpdatedAt,
    refresh,
    refreshing,
    stale,
  };
}

function isAbort(cause: unknown): boolean {
  return (
    (cause instanceof ApiError && cause.kind === "aborted") ||
    (cause instanceof DOMException && cause.name === "AbortError")
  );
}

function describeServerError(cause: unknown): string {
  if (cause instanceof InvalidServerDashboardError) return cause.message;

  if (cause instanceof ApiError) {
    if (cause.kind === "invalid-response" || cause.kind === "invalid-json") {
      return "The server feed returned data that CJS could not understand.";
    }
    if (cause.kind === "http" && cause.status) {
      return `The server feed returned HTTP ${cause.status}.`;
    }
  }

  return "CJS could not reach the live server feed. Check your connection and try again.";
}
