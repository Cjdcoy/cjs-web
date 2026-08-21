import { useCallback, useMemo, type ReactNode } from "react";
import { useQueryState } from "./queryState";
import { SourceContext } from "./sourceContext";
import { sourceQuerySchema, type SourceId } from "./sourceOptions";

export function SourceProvider({ children }: { children: ReactNode }) {
  const [queryState, setQueryState] = useQueryState(sourceQuerySchema);
  const setSource = useCallback((source: SourceId) => setQueryState({ source }), [setQueryState]);
  const value = useMemo(
    () => ({ source: queryState.source, setSource }),
    [queryState.source, setSource],
  );

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}
