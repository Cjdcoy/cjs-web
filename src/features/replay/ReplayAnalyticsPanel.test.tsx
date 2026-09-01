import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi, type Mocked } from "vitest";
import type { ReplayWatchAggregate, ReplayWatchRankingEntry } from "../../lib/api";
import { ReplayAnalyticsPanel } from "./ReplayAnalyticsPanel";
import type { ReplayAnalyticsApi } from "./useReplayAnalytics";

const aggregate: ReplayWatchAggregate = {
  owner_player_id: 42,
  replay_count: 2,
  watch_count: 18,
  unique_viewer_count: 11,
  total_watch_ms: 420_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

const ranking: ReplayWatchRankingEntry = {
  rank: 1,
  run_id: 7001,
  fps: "125",
  mapid: 101,
  owner_player_id: 42,
  mapname: "mp_cjs_training",
  owner_playername: "^2Runner",
  country: "Exampleland",
  watch_count: 12,
  unique_viewer_count: 8,
  total_watch_ms: 300_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

describe("ReplayAnalyticsPanel", () => {
  it("loads one owner aggregate and ranking request, then renders an accessible audience view", async () => {
    const apiClient = createReplayApi();
    const { container } = render(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 42 }} source="j4l" />,
    );

    expect(await screen.findByText("Watched replays")).toBeInTheDocument();
    expect(screen.getByLabelText("Replay audience summary")).toHaveTextContent(
      "Watched replays2Watches18Distinct viewers11Watch time7m",
    );
    expect(screen.getByRole("link", { name: "mp_cjs_training" })).toHaveAttribute(
      "href",
      "/maps/101?source=j4l",
    );
    await waitFor(() => {
      expect(apiClient.replayWatchAggregate).toHaveBeenCalledTimes(1);
      expect(apiClient.replayWatchRankings).toHaveBeenCalledTimes(1);
    });
    expect(apiClient.replayWatchAggregate).toHaveBeenCalledWith({
      ownerPlayerId: 42,
      signal: expect.any(AbortSignal),
      source: "j4l",
    });
    expect(apiClient.replayWatchRankings).toHaveBeenCalledWith({
      ownerPlayerId: 42,
      limit: 5,
      metric: "watch_count",
      offset: 0,
      signal: expect.any(AbortSignal),
      source: "j4l",
    });
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("does not request or render replay analytics for JumpersHeaven", () => {
    const apiClient = createReplayApi();

    const { container } = render(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 42 }} source="jh" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(apiClient.replayWatchAggregate).not.toHaveBeenCalled();
    expect(apiClient.replayWatchRankings).not.toHaveBeenCalled();
  });

  it("renders a deliberate empty state when neither watched replays nor rankings exist", async () => {
    const apiClient = createReplayApi({
      replayWatchAggregate: vi.fn().mockResolvedValue({
        ...aggregate,
        replay_count: 0,
        watch_count: 0,
        unique_viewer_count: 0,
        total_watch_ms: 0,
        first_watched_at: null,
        last_watched_at: null,
        updated_at: null,
      }),
      replayWatchRankings: vi.fn().mockResolvedValue([]),
    });

    render(<ReplayAnalyticsPanel apiClient={apiClient} scope={{ mapId: 101 }} source="j4l" />);

    expect(await screen.findByRole("heading", { name: "No replay audience yet" })).toBeVisible();
    expect(screen.queryByLabelText("Replay audience summary")).not.toBeInTheDocument();
  });

  it("identifies the most-watched replay by run ID and FPS on map profiles", async () => {
    render(
      <ReplayAnalyticsPanel apiClient={createReplayApi()} scope={{ mapId: 101 }} source="j4l" />,
    );

    expect(screen.getByRole("heading", { name: "In-game Replay views" })).toBeVisible();
    const highlight = (await screen.findByText("Most watched replay")).parentElement;
    expect(highlight).toHaveTextContent("8 viewers · 5m watched · Run #7001 · 125 FPS");
  });

  it("keeps successful aggregate data usable when rankings fail", async () => {
    const apiClient = createReplayApi({
      replayWatchRankings: vi.fn().mockRejectedValue(new Error("ranking unavailable")),
    });

    render(<ReplayAnalyticsPanel apiClient={apiClient} scope={{ mapId: 101 }} source="j4l" />);

    expect(await screen.findByLabelText("Replay audience summary")).toHaveTextContent(
      "Total views18",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Some replay analytics are unavailable.");
    expect(screen.queryByText("ranking unavailable")).not.toBeInTheDocument();
  });

  it("keeps the rankings loading status after the aggregate resolves first", async () => {
    const nextAggregate = deferred<ReplayWatchAggregate>();
    const nextRankings = deferred<ReplayWatchRankingEntry[]>();
    const apiClient = createReplayApi({
      replayWatchAggregate: vi.fn().mockReturnValue(nextAggregate.promise),
      replayWatchRankings: vi.fn().mockReturnValue(nextRankings.promise),
    });

    render(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 42 }} source="j4l" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading replay analytics");

    await act(async () => nextAggregate.resolve(aggregate));

    expect(await screen.findByLabelText("Replay audience summary")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading most viewed runs");

    await act(async () => nextRankings.resolve([ranking]));
    expect(await screen.findByRole("link", { name: "mp_cjs_training" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the aggregate loading status after the rankings resolve first", async () => {
    const nextAggregate = deferred<ReplayWatchAggregate>();
    const nextRankings = deferred<ReplayWatchRankingEntry[]>();
    const apiClient = createReplayApi({
      replayWatchAggregate: vi.fn().mockReturnValue(nextAggregate.promise),
      replayWatchRankings: vi.fn().mockReturnValue(nextRankings.promise),
    });

    render(<ReplayAnalyticsPanel apiClient={apiClient} scope={{ mapId: 101 }} source="j4l" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading replay analytics");

    await act(async () => nextRankings.resolve([ranking]));

    const runnerLink = await screen.findByRole("link", { name: "Runner" });
    expect(runnerLink).toBeVisible();
    expect(runnerLink.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(screen.getByRole("status")).toHaveTextContent("Loading replay audience totals");

    await act(async () => nextAggregate.resolve(aggregate));
    expect(await screen.findByLabelText("Replay audience summary")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("preserves stale success data through a failed refresh", async () => {
    const nextAggregate = deferred<ReplayWatchAggregate>();
    const nextRankings = deferred<ReplayWatchRankingEntry[]>();
    const apiClient = createReplayApi({
      replayWatchAggregate: vi
        .fn()
        .mockResolvedValueOnce(aggregate)
        .mockImplementationOnce(() => nextAggregate.promise),
      replayWatchRankings: vi
        .fn()
        .mockResolvedValueOnce([ranking])
        .mockImplementationOnce(() => nextRankings.promise),
    });
    const user = userEvent.setup();

    render(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 42 }} source="j4l" />,
    );
    await screen.findByLabelText("Replay audience summary");

    await user.click(screen.getByRole("button", { name: "Refresh replay analytics" }));
    expect(screen.getByRole("button", { name: "Refreshing replay analytics" })).toBeDisabled();
    expect(screen.getByLabelText("Replay audience summary")).toHaveTextContent("Watches18");

    nextAggregate.reject(new Error("aggregate refresh failed"));
    nextRankings.reject(new Error("ranking refresh failed"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Earlier results remain visible.");
    expect(screen.getByLabelText("Replay audience summary")).toHaveTextContent("Watches18");
    expect(apiClient.replayWatchAggregate).toHaveBeenCalledTimes(2);
    expect(apiClient.replayWatchRankings).toHaveBeenCalledTimes(2);
  });

  it("aborts obsolete scope requests and ignores their late results", async () => {
    const oldAggregate = deferred<ReplayWatchAggregate>();
    const oldRankings = deferred<ReplayWatchRankingEntry[]>();
    const apiClient = createReplayApi({
      replayWatchAggregate: vi
        .fn()
        .mockImplementationOnce(() => oldAggregate.promise)
        .mockResolvedValueOnce({ ...aggregate, owner_player_id: 43, watch_count: 43 }),
      replayWatchRankings: vi
        .fn()
        .mockImplementationOnce(() => oldRankings.promise)
        .mockResolvedValueOnce([{ ...ranking, owner_player_id: 43, watch_count: 43 }]),
    });
    const { rerender } = render(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 42 }} source="j4l" />,
    );
    await waitFor(() => expect(apiClient.replayWatchRankings).toHaveBeenCalledOnce());
    const aggregateSignal = apiClient.replayWatchAggregate.mock.calls[0]?.[0].signal;
    const rankingSignal = apiClient.replayWatchRankings.mock.calls[0]?.[0].signal;

    rerender(
      <ReplayAnalyticsPanel apiClient={apiClient} scope={{ ownerPlayerId: 43 }} source="j4l" />,
    );

    expect(await screen.findByLabelText("Replay audience summary")).toHaveTextContent("Watches43");
    expect(aggregateSignal?.aborted).toBe(true);
    expect(rankingSignal?.aborted).toBe(true);

    oldAggregate.resolve({ ...aggregate, watch_count: 99 });
    oldRankings.resolve([{ ...ranking, watch_count: 99 }]);
    await waitFor(() => {
      expect(screen.getByLabelText("Replay audience summary")).toHaveTextContent("Watches43");
      expect(screen.queryByText("99")).not.toBeInTheDocument();
    });
  });
});

function createReplayApi(
  overrides: Partial<Mocked<ReplayAnalyticsApi>> = {},
): Mocked<ReplayAnalyticsApi> {
  return {
    replayWatchAggregate: vi.fn().mockResolvedValue(aggregate),
    replayWatchRankings: vi.fn().mockResolvedValue([ranking]),
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
