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

  it("requests v2 MessagePack and decodes a Go-produced payload", async () => {
    const json = JSON.parse(
      '{"empty":[],"map_keys":{"1":2},"max_uint64":18446744073709551615,"negative_zero":-0,"nil":null,"timestamp":"2026-09-05T01:02:03Z","unsafe":9007199254740993}',
    );
    const bytes = Uint8Array.from(
      atob(
        "h6htYXBfa2V5c4GhMQKqbWF4X3VpbnQ2NM///////////61uZWdhdGl2ZV96ZXJvy4AAAAAAAAAAo25pbMCpdGltZXN0YW1wtDIwMjYtMDktMDVUMDE6MDI6MDNapnVuc2FmZc8AIAAAAAAAAaVlbXB0eZA=",
      ),
      (character) => character.charCodeAt(0),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { headers: { "Content-Type": "application/msgpack" } }),
      );
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      format: "msgpack",
    });

    const decoded = await client.get("/api/v1/test");
    expect(decoded).toEqual(json);
    expect(Object.is((decoded as { negative_zero: number }).negative_zero, -0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/v2/test",
      expect.objectContaining({ headers: { Accept: "application/msgpack" } }),
    );
  });

  it.each([
    ["malformed payload", new Uint8Array([0xc1]), "application/msgpack"],
    ["wrong content type", new Uint8Array([0x80]), "application/msgpackjunk"],
  ])("rejects MessagePack with a %s without retry or fallback", async (_, body, contentType) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { "Content-Type": contentType } }));
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      format: "msgpack",
      maxRetries: 2,
    });

    await expect(client.get("/api/v1/maps")).rejects.toMatchObject({
      kind: "invalid-messagepack",
      path: "/api/v2/maps",
      attempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves cancellation while reading a MessagePack response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/msgpack; charset=binary" }),
      arrayBuffer: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
    } as unknown as Response);
    const client = createJsonClient({
      baseUrl: "https://example.test",
      fetch: fetchMock as typeof fetch,
      format: "msgpack",
    });

    await expect(client.get("/api/v1/maps")).rejects.toMatchObject({
      kind: "aborted",
      path: "/api/v2/maps",
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
