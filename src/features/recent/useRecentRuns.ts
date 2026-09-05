import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type TopRun } from "../../lib/api";
import { parseApiDate } from "../../lib/format";
import { sourceOptions, type SourceId } from "../../lib/routing";

const SOURCES = sourceOptions.map(({ value }) => value);

export interface RecentRunEntry {
  run: TopRun;
  source: SourceId;
}

export interface RecentRunsError {
  message: string;
  source: SourceId;
}

interface SourceState {
  cursor: string | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  runs: TopRun[];
}

type SourceStates = Readonly<Record<SourceId, SourceState>>;

export function useRecentRuns() {
  const [reloadVersion, setReloadVersion] = useState(0);
  const [states, setStates] = useState<SourceStates>(initialStates);
  const moreRequest = useRef<AbortController | null>(null);

  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    moreRequest.current?.abort();
    setStates(initialStates);

    for (const source of SOURCES) {
      api
        .recentRuns({ source, signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [source]: {
              cursor: page.nextCursor,
              error: null,
              loading: false,
              loadingMore: false,
              runs: page.runs,
            },
          }));
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [source]: { ...current[source], error: errorMessage(reason), loading: false },
          }));
        });
    }

    return () => {
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [reloadVersion]);

  const loadMore = useCallback(() => {
    // ponytail: advances every source's cursor at once, so a load-more can splice
    // older rows into the middle of the merged list. Upgrade path: advance only the
    // source whose oldest loaded run is the newest.
    const controller = new AbortController();
    moreRequest.current = controller;

    for (const source of SOURCES) {
      const state = states[source];
      if (!state.cursor || state.loading || state.loadingMore) continue;

      setStates((current) => ({
        ...current,
        [source]: { ...current[source], error: null, loadingMore: true },
      }));

      api
        .recentRuns({ source, cursor: state.cursor, signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [source]: {
              ...current[source],
              cursor: page.nextCursor,
              loadingMore: false,
              runs: [...current[source].runs, ...page.runs],
            },
          }));
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [source]: { ...current[source], error: errorMessage(reason), loadingMore: false },
          }));
        });
    }
  }, [states]);

  const runs = useMemo(
    () =>
      SOURCES.flatMap((source) => states[source].runs.map((run) => ({ run, source }))).sort(
        compareEntries,
      ),
    [states],
  );

  return {
    errors: SOURCES.flatMap((source) =>
      states[source].error === null
        ? []
        : [{ message: states[source].error, source } satisfies RecentRunsError],
    ),
    hasMore: SOURCES.some((source) => states[source].cursor !== null),
    loadMore,
    loading: SOURCES.some((source) => states[source].loading && states[source].runs.length === 0),
    loadingMore: SOURCES.some((source) => states[source].loadingMore),
    reload,
    runs,
  };
}

function compareEntries(left: RecentRunEntry, right: RecentRunEntry): number {
  const byDate = finishedAt(right.run) - finishedAt(left.run);
  return byDate === 0 ? (right.run.run_id ?? 0) - (left.run.run_id ?? 0) : byDate;
}

function finishedAt(run: TopRun): number {
  const time = run.time_created ? parseApiDate(run.time_created).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

function initialStates(): SourceStates {
  return { j4l: emptySourceState(), jh: emptySourceState() };
}

function emptySourceState(): SourceState {
  return { cursor: null, error: null, loading: true, loadingMore: false, runs: [] };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The recent updates request failed.";
}
