import { useCallback, useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  requestKey: string;
}

export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, requestKey: string) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    requestKey,
  });
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({
      data: current.requestKey === requestKey ? current.data : null,
      error: null,
      loading: true,
      requestKey,
    }));
    loader(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setState({ data: value, error: null, loading: false, requestKey });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.requestKey === requestKey ? current.data : null,
          error: reason instanceof Error ? reason.message : "Unknown error",
          loading: false,
          requestKey,
        }));
      });
    return () => controller.abort();
  }, [loader, requestKey, version]);

  if (state.requestKey !== requestKey) {
    return { data: null, loading: true, error: null, reload };
  }

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
