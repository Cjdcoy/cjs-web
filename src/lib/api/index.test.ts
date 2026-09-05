import { describe, expect, it, vi } from "vitest";
import { encode } from "@msgpack/msgpack";
import {
  mapsFixture,
  replayWatchAggregateFixture,
  replayWatchRankingsFixture,
} from "./__fixtures__/responses";
import { createCjsApiForBases, resolveApiFormat } from "./index";

describe("API base routing", () => {
  it("can route only replay analytics to a local backend", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.toString());
      if (url.pathname.endsWith("/replay/watch-aggregate")) {
        return Response.json({
          ...(replayWatchAggregateFixture as Record<string, unknown>),
          mapid: 101,
        });
      }
      if (url.pathname.endsWith("/replay/watch-rankings")) {
        return Response.json(replayWatchRankingsFixture);
      }
      return Response.json(mapsFixture);
    });
    const api = createCjsApiForBases({
      apiBase: "https://api.jump4life.org",
      fetch: fetchMock as typeof fetch,
      replayApiBase: "http://127.0.0.1:8080",
    });

    await api.maps({ source: "j4l" });
    await api.replayWatchAggregate({ source: "j4l", mapId: 101 });
    await api.replayWatchRankings({
      source: "j4l",
      mapId: 101,
      metric: "watch_count",
      limit: 1,
      offset: 0,
    });

    expect(urls).toEqual([
      "https://api.jump4life.org/api/v1/map/all?source=j4l",
      "http://127.0.0.1:8080/api/v1/replay/watch-aggregate?source=j4l&mapid=101",
      "http://127.0.0.1:8080/api/v1/replay/watch-rankings?source=j4l&metric=watch_count&mapid=101&limit=1&offset=0",
    ]);
  });

  it("keeps normalized v2 JSON and MessagePack results and routing identical", async () => {
    const results: unknown[] = [];

    for (const format of ["json", "msgpack"] as const) {
      const requests: Array<{ accept: string | null; url: string }> = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        requests.push({
          accept: new Headers(init?.headers).get("Accept"),
          url: url.toString(),
        });
        const payload = url.pathname.endsWith("/replay/watch-aggregate")
          ? { ...(replayWatchAggregateFixture as Record<string, unknown>), mapid: 101 }
          : mapsFixture;
        return format === "msgpack"
          ? new Response(Uint8Array.from(encode(payload)).buffer, {
              headers: { "Content-Type": "application/msgpack" },
            })
          : Response.json(payload);
      });
      const api = createCjsApiForBases({
        apiBase: "https://api.example.test",
        fetch: fetchMock as typeof fetch,
        format,
        replayApiBase: "https://replay.example.test",
      });

      results.push(await api.maps({ source: "j4l" }));
      await expect(api.replayWatchAggregate({ source: "j4l", mapId: 101 })).resolves.toMatchObject({
        mapid: 101,
      });
      expect(requests).toEqual([
        {
          accept: format === "msgpack" ? "application/msgpack" : "application/json",
          url: "https://api.example.test/api/v2/map/all?source=j4l",
        },
        {
          accept: format === "msgpack" ? "application/msgpack" : "application/json",
          url: "https://replay.example.test/api/v2/replay/watch-aggregate?source=j4l&mapid=101",
        },
      ]);
    }

    expect(results[1]).toEqual(results[0]);
  });

  it("selects a valid session override before the build setting", () => {
    expect(resolveApiFormat("json", { getItem: () => "msgpack" })).toBe("msgpack");
    expect(resolveApiFormat("json", { getItem: () => null })).toBe("json");
    expect(resolveApiFormat("json", { getItem: () => "invalid" })).toBe("json");
    expect(
      resolveApiFormat("msgpack", {
        getItem: () => {
          throw new DOMException("Blocked", "SecurityError");
        },
      }),
    ).toBe("msgpack");
    expect(resolveApiFormat("invalid", { getItem: () => null })).toBe("legacy");
  });
});
