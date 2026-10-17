import { HttpResponse, http } from "msw";
import {
  replayViewCountsFixture,
  replayWatchRankingsFixture,
  replayWebViewAggregateFixture,
  replayWebViewSummaryFixture,
} from "../lib/api/__fixtures__/responses";

/** MSW handlers for the web replay-view endpoints (ADR 0005); `server.use(...)` them per test. */
export const replayWebViewHandlers = [
  http.get("*/api/:version/replay/web-view-summary", () =>
    Response.json(replayWebViewSummaryFixture),
  ),
  http.get("*/api/:version/replay/web-view-aggregate", () =>
    Response.json(replayWebViewAggregateFixture),
  ),
  http.get("*/api/:version/replay/web-view-rankings", () =>
    Response.json(replayWatchRankingsFixture),
  ),
  http.get("*/api/:version/replay/view-counts", () => Response.json(replayViewCountsFixture)),
  http.post("*/api/v1/replay/views", () => new HttpResponse(null, { status: 204 })),
];
