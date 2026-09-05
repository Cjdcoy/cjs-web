import { ApiError } from "./errors";

export type QueryValue = string | number | boolean | null | undefined;
export type ApiQuery = Record<string, QueryValue>;

export interface ApiRetryEvent {
  attempt: number;
  delayMs: number;
  maxAttempts: number;
  path: string;
  reason: "network" | "status";
  status?: number;
}

export type ApiRetryListener = (event: ApiRetryEvent) => void;

export interface JsonGetOptions {
  query?: ApiQuery;
  signal?: AbortSignal;
  onRetry?: ApiRetryListener;
}

export interface JsonClient {
  get(path: string, options?: JsonGetOptions): Promise<unknown>;
}

export interface JsonClientConfig {
  baseUrl: string;
  format?: ApiFormat;
  fetch?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export type ApiFormat = "legacy" | "json" | "msgpack";

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function buildApiUrl(baseUrl: string, path: string, query: ApiQuery = {}): string {
  const normalizedBase = `${baseUrl.replace(/\/+$/, "")}/`;
  const url = new URL(path.replace(/^\/+/, ""), normalizedBase);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function createJsonClient(config: JsonClientConfig): JsonClient {
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  const maxRetries = clampInteger(config.maxRetries ?? 1, 0, 3);
  const retryDelayMs = Math.max(0, config.retryDelayMs ?? 250);
  const maxRetryDelayMs = Math.max(retryDelayMs, config.maxRetryDelayMs ?? 2_000);
  const sleep = config.sleep ?? abortableSleep;
  const format = config.format ?? "legacy";
  const messagePackDecoder =
    format === "msgpack"
      ? import("@msgpack/msgpack").then(
          ({ decode }) => decode,
          (cause: unknown) => () => {
            throw cause;
          },
        )
      : undefined;

  return {
    async get(path, options = {}) {
      const requestPath = format === "legacy" ? path : path.replace(/^\/api\/v1(?=\/)/, "/api/v2");
      const url = buildApiUrl(config.baseUrl, requestPath, options.query);
      const safePath = safeEndpointPath(requestPath);
      const maxAttempts = maxRetries + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (options.signal?.aborted) {
          throw abortedError(safePath, attempt, options.signal.reason);
        }

        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "GET",
            signal: options.signal,
            headers: { Accept: format === "msgpack" ? "application/msgpack" : "application/json" },
          });
        } catch (cause) {
          if (isAbort(cause, options.signal)) {
            throw abortedError(safePath, attempt, cause);
          }

          if (attempt < maxAttempts) {
            const delayMs = retryDelay(attempt, retryDelayMs, maxRetryDelayMs);
            notifyRetry(options.onRetry, {
              attempt,
              delayMs,
              maxAttempts,
              path: safePath,
              reason: "network",
            });
            await sleepOrAbort(sleep, delayMs, safePath, attempt, options.signal);
            continue;
          }

          throw new ApiError({
            kind: "network",
            message: `API request could not be completed for ${safePath}`,
            path: safePath,
            attempts: attempt,
            retryable: true,
            cause,
          });
        }

        if (!response.ok) {
          const retryable = TRANSIENT_STATUSES.has(response.status);
          if (retryable && attempt < maxAttempts) {
            const delayMs = retryDelay(attempt, retryDelayMs, maxRetryDelayMs);
            notifyRetry(options.onRetry, {
              attempt,
              delayMs,
              maxAttempts,
              path: safePath,
              reason: "status",
              status: response.status,
            });
            await sleepOrAbort(sleep, delayMs, safePath, attempt, options.signal);
            continue;
          }

          throw new ApiError({
            kind: "http",
            message: `API request failed (${response.status}) for ${safePath}`,
            path: safePath,
            status: response.status,
            attempts: attempt,
            retryable,
          });
        }

        try {
          if (format === "msgpack") {
            const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
            if (mediaType?.toLowerCase() !== "application/msgpack") {
              throw new TypeError("Unexpected content type");
            }
            const decode = await messagePackDecoder;
            if (!decode) throw new TypeError("MessagePack decoder unavailable");
            return decode(await response.arrayBuffer());
          }
          return await response.json();
        } catch (cause) {
          if (isAbort(cause, options.signal)) {
            throw abortedError(safePath, attempt, cause);
          }
          const kind = format === "msgpack" ? "invalid-messagepack" : "invalid-json";
          throw new ApiError({
            kind,
            message: `API returned invalid ${format === "msgpack" ? "MessagePack" : "JSON"} for ${safePath}`,
            path: safePath,
            status: response.status,
            attempts: attempt,
            cause,
          });
        }
      }

      throw new ApiError({
        kind: "network",
        message: `API request could not be completed for ${safePath}`,
        path: safePath,
        attempts: maxAttempts,
        retryable: true,
      });
    },
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function retryDelay(attempt: number, baseDelayMs: number, maximumDelayMs: number): number {
  return Math.min(maximumDelayMs, baseDelayMs * 2 ** (attempt - 1));
}

function safeEndpointPath(path: string): string {
  try {
    return new URL(path, "https://cjs.invalid").pathname || "/";
  } catch {
    return "/";
  }
}

function notifyRetry(listener: ApiRetryListener | undefined, event: ApiRetryEvent): void {
  if (!listener) return;
  listener(event);
}

function isAbort(cause: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (cause instanceof DOMException && cause.name === "AbortError");
}

function abortedError(path: string, attempts: number, cause?: unknown): ApiError {
  return new ApiError({
    kind: "aborted",
    message: `API request was cancelled for ${path}`,
    path,
    attempts,
    cause,
  });
}

async function sleepOrAbort(
  sleep: NonNullable<JsonClientConfig["sleep"]>,
  delayMs: number,
  path: string,
  attempts: number,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await sleep(delayMs, signal);
  } catch (cause) {
    if (isAbort(cause, signal)) throw abortedError(path, attempts, cause);
    throw cause;
  }
}

function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
