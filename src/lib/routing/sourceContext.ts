import { createContext, useContext } from "react";
import type { SourceId } from "./sourceOptions";

export interface SourceContextValue {
  source: SourceId;
  setSource: (source: SourceId) => void;
}

export const SourceContext = createContext<SourceContextValue | null>(null);

export function useSourceContext(): SourceContextValue {
  const value = useContext(SourceContext);
  if (!value) throw new Error("useSourceContext must be used within SourceProvider.");
  return value;
}
