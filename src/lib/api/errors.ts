import type { Capability } from "./capabilities";
import type { Game, Source } from "./domain";

export type ApiErrorKind =
  | "aborted"
  | "http"
  | "invalid-argument"
  | "invalid-json"
  | "invalid-messagepack"
  | "invalid-response"
  | "network";

export interface ApiErrorOptions {
  kind: ApiErrorKind;
  message: string;
  path: string;
  status?: number;
  attempts?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly path: string;
  readonly status?: number;
  readonly attempts: number;
  readonly retryable: boolean;

  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApiError";
    this.kind = options.kind;
    this.path = options.path;
    this.status = options.status;
    this.attempts = options.attempts ?? 1;
    this.retryable = options.retryable ?? false;
  }
}

export class UnsupportedCapabilityError extends Error {
  readonly capability: Capability;
  readonly game: Game;
  readonly source: Source;

  constructor(capability: Capability, source: Source, game: Game) {
    super(`${capability} is not available for ${source}/${game}`);
    this.name = "UnsupportedCapabilityError";
    this.capability = capability;
    this.source = source;
    this.game = game;
  }
}

export function invalidArgument(path: string, argument: string): ApiError {
  return new ApiError({
    kind: "invalid-argument",
    message: `Invalid API argument: ${argument}`,
    path,
  });
}

export function invalidResponse(path: string, field: string): ApiError {
  return new ApiError({
    kind: "invalid-response",
    message: `API returned invalid data for ${path} at ${field}`,
    path,
  });
}
