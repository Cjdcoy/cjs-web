import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import { buildApiUrl, createJsonClient, type ApiRetryEvent } from "./client";

describe("JSON API client", () => {
  it("builds deterministic, encoded URLs without empty parameters", () => {
    expect(
      buildApiUrl("https://example.test/proxy/", "/api/v1/player/id-from-name", {
        source: "jh",
        name: "^1 Runner / ?",
        limit: 3,
        empty: undefined,
      }),
    ).toBe(
      "https://example.test/proxy/api/v1/player/id-from-name?source=jh&name=%5E1+Runner+%2F+%3F&limit=3",
    );
  });

  it("retries bounded transient responses and reports retry state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retries: ApiRetryEvent[] = [];
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      maxRetries: 1,
      retryDelayMs: 20,
      sleep,
    });

    await expect(
      client.get("/api/v1/test", { onRetry: (event) => retries.push(event) }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(20, undefined);
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 20,
        maxAttempts: 2,
        path: "/api/v1/test",
        reason: "status",
        status: 503,
      },
    ]);
  });

  it("never retries ordinary 4xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      maxRetries: 3,
      sleep: vi.fn(),
    });

    const error = await client
      .get("/api/v1/missing?token=secret", { query: { playerid: 501 } })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "http",
      path: "/api/v1/missing",
      status: 404,
      attempts: 1,
      retryable: false,
    });
    expect(String(error)).not.toContain("playerid");
    expect(String(error)).not.toContain("secret");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network failures once and returns a structured safe error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("secret upstream detail"));
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      maxRetries: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const error = await client
      .get("/api/v1/player/all", { query: { source: "jh" } })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      kind: "network",
      path: "/api/v1/player/all",
      attempts: 2,
      retryable: true,
    });
    expect(String(error)).not.toContain("secret upstream detail");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("wraps malformed JSON without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      maxRetries: 2,
    });

    await expect(client.get("/api/v1/maps")).rejects.toMatchObject({
      kind: "invalid-json",
      path: "/api/v1/maps",
      attempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels before issuing a request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      client.get("/api/v1/player/all", { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "aborted", attempts: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
