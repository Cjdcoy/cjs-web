import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayWebViewHeat } from "../../lib/api";
import { replayWebViewHandlers } from "../../test/replayWebViewHandlers";
import { server } from "../../test/server";
import { heatGradient, heatStops, mostWatched } from "./replayHeat";
import { ReplayHeatStrip, ReplayViewCountBadge } from "./ReplayWebViews";

describe("ReplayViewCountBadge", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "1");
    server.use(...replayWebViewHandlers);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows web and in-game views for the run, loading first", async () => {
    const requested: URL[] = [];
    server.use(
      http.get("*/api/v1/replay/view-counts", ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json({ "7001": { web: 1_234, in_game: 340 } });
      }),
    );
    const { container } = render(<ReplayViewCountBadge runId={7001} />);

    expect(screen.getByText("Loading views…")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("1.2K web views · 340 in-game")).toBeVisible();
    expect(requested[0]?.searchParams.get("run_ids")).toBe("7001");
    expect(requested[0]?.searchParams.get("source")).toBe("j4l");
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("says when a run has no views yet", async () => {
    server.use(http.get("*/api/v1/replay/view-counts", () => HttpResponse.json({})));
    render(<ReplayViewCountBadge runId={7001} />);
    expect(await screen.findByText("No views yet")).toBeVisible();
  });

  it("says when the counts are unavailable", async () => {
    server.use(
      http.get("*/api/v1/replay/view-counts", () => new HttpResponse(null, { status: 404 })),
    );
    render(<ReplayViewCountBadge runId={7001} />);
    expect(await screen.findByText("Views unavailable")).toBeVisible();
  });

  it("renders and requests nothing while the feature is off", () => {
    vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "");
    // Any request would fail the test: unhandled requests are errors and no handler matches.
    server.resetHandlers();
    const { container } = render(<ReplayViewCountBadge runId={7001} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const heat: ReplayWebViewHeat = {
  bucket_ms: 5_000,
  view_count: [1, 4, 4, 2],
  watch_ms: [5_000, 20_000, 22_000, 9_000],
};

describe("ReplayHeatStrip", () => {
  it("draws one gradient band and speaks the most watched stretch", async () => {
    const { container } = render(<ReplayHeatStrip heat={heat} span={20_000} />);

    const strip = container.querySelector<HTMLElement>(".cjs-replay-player__heat");
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(strip?.style.getPropertyValue("--cjs-replay-heat")).toBe(
      heatGradient(heatStops(heat, 20_000)),
    );
    expect(screen.getByText("Most watched: 0:05–0:15")).toBeInTheDocument();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("draws nothing before anyone has watched", () => {
    const empty = { bucket_ms: 5_000, view_count: [0, 0], watch_ms: [0, 0] };
    const { container } = render(<ReplayHeatStrip heat={empty} span={10_000} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("replay heat model", () => {
  it("scales bands to the peak and closes the gradient after the last bucket", () => {
    expect(heatStops(heat, 40_000)).toEqual([
      { start: 0, end: 0.125, level: 0.25 },
      { start: 0.125, end: 0.25, level: 1 },
      { start: 0.25, end: 0.375, level: 1 },
      { start: 0.375, end: 0.5, level: 0.5 },
    ]);
    expect(heatGradient(heatStops(heat, 40_000))).toBe(
      "linear-gradient(to right, " +
        "color-mix(in srgb, var(--cjs-color-accent) 25%, transparent) 0% 12.5%, " +
        "color-mix(in srgb, var(--cjs-color-accent) 100%, transparent) 12.5% 25%, " +
        "color-mix(in srgb, var(--cjs-color-accent) 100%, transparent) 25% 37.5%, " +
        "color-mix(in srgb, var(--cjs-color-accent) 50%, transparent) 37.5% 50%, " +
        "transparent 50%)",
    );
  });

  it("downsamples long replays to at most 200 bands, keeping peaks", () => {
    const counts = Array.from({ length: 8_640 }, (_, index) => (index === 4_321 ? 9 : 1));
    const stops = heatStops({ bucket_ms: 5_000, view_count: counts, watch_ms: counts }, 43_200_000);
    expect(stops.length).toBeLessThanOrEqual(200);
    expect(stops.filter((stop) => stop.level === 1)).toHaveLength(1);
    expect(
      mostWatched({ bucket_ms: 5_000, view_count: counts, watch_ms: counts }, 43_200_000),
    ).toEqual({ start: 21_605_000, end: 21_610_000 });
  });
});
