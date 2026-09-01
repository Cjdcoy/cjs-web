import { describe, expect, it, vi } from "vitest";
import {
  mapsFixture,
  replayWatchAggregateFixture,
  replayWatchRankingsFixture,
} from "./__fixtures__/responses";
import { createCjsApiForBases } from "./index";

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
});
