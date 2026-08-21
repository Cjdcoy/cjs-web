import { useCallback, useEffect, useState } from "react";
import { api, type Fps, type Source, type TopRun } from "../../lib/api";
import {
  parseMapRouteId,
  resolveMapRecord,
  type MapLookup,
  type MapRecord,
} from "./mapDetailModel";

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
