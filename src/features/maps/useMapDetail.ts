import { useCallback, useEffect, useState } from "react";
import { api, type Fps, type MapPlayerPlaytime, type Source, type TopRun } from "../../lib/api";
import {
  MAP_PROFILE_FPS_VALUES,
  mergePlaytime,
  parseMapRouteId,
  resolveMapRecord,
  type MapLookup,
  type MapProfileFps,
  type MapRecord,
  type PlaytimeFps,
  type PlaytimeRow,
} from "./mapDetailModel";

export const MOST_PLAYED_LIMIT = 50;
// Each FPS fetches more rows than are shown so the "all" sum rarely misses a player's time at
// one FPS. ponytail: a player outside one FPS's top 100 is undercounted there; the API has no
// all-FPS query, add one if that matters.
const PLAYTIME_FETCH_LIMIT = 100;
// ponytail: one entry per (source, map, FPS, route) for the page session, never evicted.
const playtimeCache = new Map<string, Promise<MapPlayerPlaytime[]>>();

type RequestStatus = "idle" | "loading" | "success" | "error";

interface RequestState<Data> {
  key: string | null;
  status: RequestStatus;
  data: Data | null;
  error: string | null;
}

interface RequestResult<Data> extends Omit<RequestState<Data>, "key"> {
  reload: () => void;
}

const idleState: RequestState<never> = {
  key: null,
  status: "idle",
  data: null,
  error: null,
};

export function useMapRecord(options: {
  mapId: string;
  lookup: MapLookup;
  source: Source;
}): RequestResult<MapRecord> {
  const requestedId = parseMapRouteId(options.mapId);
  const key = `${options.source}:${options.lookup}:${options.mapId}`;
  const loader = useCallback(
    async (signal: AbortSignal) => {
      if (requestedId === null) return null;
      const maps = await api.maps({ source: options.source, signal });
      return resolveMapRecord(maps, requestedId, options.lookup);
    },
    [options.lookup, options.source, requestedId],
  );

  return useKeyedRequest(key, loader);
}

export function useMapTopRuns(options: {
  checkpointId: number | null;
  fps: Fps;
  source: Source;
}): RequestResult<TopRun[]> {
  const key =
    options.checkpointId === null
      ? null
      : `${options.source}:${options.checkpointId}:${options.fps}`;
  const loader = useCallback(
    async (signal: AbortSignal) => {
      if (options.checkpointId === null) return [];
      return api.mapTops({
        source: options.source,
        checkpointId: options.checkpointId,
        fps: options.fps,
        limit: 100,
        signal,
      });
    },
    [options.checkpointId, options.fps, options.source],
  );

  return useKeyedRequest(key, loader);
}

/**
 * Lazily loads a map's most-played players; pass `fps: null` to load nothing. `ender` limits
 * playtime to one route, null covers every route.
 */
export function useMapPlaytime(options: {
  mapId: number;
  fps: PlaytimeFps | null;
  ender: string | null;
  source: Source;
}): RequestResult<PlaytimeRow[]> {
  const key =
    options.fps === null
      ? null
      : `playtime:${options.source}:${options.mapId}:${options.fps}:${options.ender ?? ""}`;
  const loader = useCallback(async () => {
    if (options.fps === null) return [];
    const fpsValues = options.fps === "all" ? MAP_PROFILE_FPS_VALUES : [options.fps];
    const perFps = await Promise.all(
      fpsValues.map(
        async (fps) =>
          [fps, await cachedPlaytime(options.source, options.mapId, fps, options.ender)] as const,
      ),
    );
    return mergePlaytime(perFps).slice(0, MOST_PLAYED_LIMIT);
  }, [options.ender, options.fps, options.mapId, options.source]);

  return useKeyedRequest(key, loader);
}

function cachedPlaytime(
  source: Source,
  mapId: number,
  fps: MapProfileFps,
  ender: string | null,
): Promise<MapPlayerPlaytime[]> {
  const key = `${source}:${mapId}:${fps}:${ender ?? ""}`;
  let request = playtimeCache.get(key);
  if (!request) {
    // No abort signal: the promise is shared between views (All and one FPS), so it must not be
    // cancelled by the view that started it. A superseded view drops the result instead.
    request = api.mapPlayersPlaytime({
      source,
      mapId,
      fps,
      ender: ender ?? undefined,
      limit: PLAYTIME_FETCH_LIMIT,
    });
    void request.catch(() => playtimeCache.delete(key));
    playtimeCache.set(key, request);
  }
  return request;
}

function useKeyedRequest<Data>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<Data | null>,
): RequestResult<Data> {
  const [state, setState] = useState<RequestState<Data>>(idleState);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (key === null) {
      setState(idleState);
      return;
    }

    const controller = new AbortController();
    setState({ key, status: "loading", data: null, error: null });

    void loader(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ key, status: "success", data, error: null });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          status: "error",
          data: null,
          error: describeRequestError(reason),
        });
      });

    return () => controller.abort();
  }, [key, loader, version]);

  if (key === null) return { ...idleState, reload };
  if (state.key !== key) {
    return { status: "loading", data: null, error: null, reload };
  }

  return { status: state.status, data: state.data, error: state.error, reload };
}

function describeRequestError(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return "The API request failed unexpectedly.";
}
