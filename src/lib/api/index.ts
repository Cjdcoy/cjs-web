import { createJsonClient, type ApiFormat, type JsonClientConfig } from "./client";
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

export const API_FORMAT = resolveApiFormat();

export function resolveApiFormat(
  configured = import.meta.env.VITE_API_FORMAT,
  storage: Pick<Storage, "getItem"> | undefined = browserSessionStorage(),
): ApiFormat {
  try {
    const override = storage?.getItem("cjs-api-format");
    if (override === "json" || override === "msgpack") return override;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return configured === "json" || configured === "msgpack" ? configured : "legacy";
}

export function createCjsApiForBases({
  apiBase,
  fetch,
  format = "legacy",
  replayApiBase = apiBase,
}: {
  apiBase: string;
  fetch?: JsonClientConfig["fetch"];
  format?: ApiFormat;
  replayApiBase?: string;
}): CjsApi {
  const clientOptions = (baseUrl: string): JsonClientConfig => ({
    baseUrl,
    format,
    ...(fetch === undefined ? {} : { fetch }),
  });
  return createCjsApi(
    createJsonClient(clientOptions(apiBase)),
    createJsonClient(clientOptions(replayApiBase)),
  );
}

export const api = createCjsApiForBases({
  apiBase: API_BASE,
  format: API_FORMAT,
  replayApiBase: REPLAY_API_BASE,
});

function browserSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
