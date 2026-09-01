import { createJsonClient, type JsonClientConfig } from "./client";
import { createCjsApi, type CjsApi } from "./endpoints";

export * from "./capabilities";
export * from "./client";
export * from "./domain";
export * from "./endpoints";
export * from "./errors";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "https://api.jump4life.org";

export const REPLAY_API_BASE =
  import.meta.env.VITE_REPLAY_API_BASE_URL?.replace(/\/+$/, "") || API_BASE;

export function createCjsApiForBases({
  apiBase,
  fetch,
  replayApiBase = apiBase,
}: {
  apiBase: string;
  fetch?: JsonClientConfig["fetch"];
  replayApiBase?: string;
}): CjsApi {
  const clientOptions = (baseUrl: string): JsonClientConfig => ({
    baseUrl,
    ...(fetch === undefined ? {} : { fetch }),
  });
  return createCjsApi(
    createJsonClient(clientOptions(apiBase)),
    createJsonClient(clientOptions(replayApiBase)),
  );
}

export const api = createCjsApiForBases({ apiBase: API_BASE, replayApiBase: REPLAY_API_BASE });
