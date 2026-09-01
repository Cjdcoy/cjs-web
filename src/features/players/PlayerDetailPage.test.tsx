import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  FPS_VALUES,
  type GameMap,
  type Player,
  type PlayerActivitySummary,
  type PlayerJumpScores,
  type PlayerLeaderboardPosition,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type ReplayWatchAggregate,
  type ReplayWatchRankingEntry,
  type TopRun,
} from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { clearPlayerDirectoryCache } from "./playerDirectoryCache";
import { PlayerDetailPage } from "./PlayerDetailPage";
import type { PlayerProfileApi } from "./usePlayerProfile";

describe("PlayerDetailPage", () => {
  beforeEach(() => {
    clearPlayerDirectoryCache();
    vi.stubGlobal("localStorage", createStorage());
    window.history.replaceState(null, "", "/players/42");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a URL-backed J4L overview with richer activity and recent records", async () => {
    window.history.replaceState(
      null,
      "",
      "/players/42?source=j4l&fps=250&board=surf&campaign=summer",
    );
    const apiClient = createProfileApi({
      playerLeaderboardPositions: vi
        .fn()
        .mockResolvedValue([position, { ...position, leaderboard_type: "speed", rank: 8 }]),
      playerPerformance: vi.fn().mockResolvedValue({ ...performance, admin_level: 101 }),
    });

    const { container } = renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    const profileFlag = screen.getByRole("img", { name: "Testland" });
    expect(profileFlag).toHaveClass("cjs-player-profile__avatar");
    expect(profileFlag).toHaveAttribute("data-size", "large");
    expect(profileFlag.querySelector("img")).toHaveAttribute("src", "/country-flags/tl.svg");
    expect(screen.getByText("Testland").closest(".cjs-player-profile__meta")).not.toContainElement(
      profileFlag,
    );
    expect(apiClient.playerLeaderboardPositions).toHaveBeenCalledWith(
      expect.objectContaining({ fps: "250", playerId: 42, source: "j4l" }),
    );
    expect(apiClient.playerLeaderboardPositions).not.toHaveBeenCalledWith(
      expect.objectContaining({ leaderboard: expect.anything() }),
    );
    expect(apiClient.playerJumpScores).not.toHaveBeenCalled();
    expect(apiClient.playerRoutes).not.toHaveBeenCalled();
    expect(apiClient.playerRank).toHaveBeenCalledOnce();
    expect(apiClient.playerActivitySummary).toHaveBeenCalledOnce();
    expect(apiClient.replayWatchAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPlayerId: 42, source: "j4l" }),
    );
    expect(apiClient.replayWatchRankings).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPlayerId: 42, metric: "watch_count", source: "j4l" }),
    );
    expect(await screen.findByRole("heading", { name: "Replay reach" })).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", { name: "Refresh profile" });
    expect(refreshButton).toHaveAttribute("title", "Refresh profile");
    expect(refreshButton).toHaveAttribute("data-variant", "ghost");
    expect(refreshButton).toHaveTextContent("");
    const performanceHeading = screen.getByRole("heading", { level: 2, name: "Performance" });
    const recentActivity = screen.getByRole("heading", { level: 2, name: "Recent activity" });
    expect(performanceHeading).toBeInTheDocument();
    expect(recentActivity).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Leaderboard positions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Jump4Life rank" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Player highlights")).not.toBeInTheDocument();
    const accountDetails = screen.getByLabelText("Account details");
    expect(accountDetails).toHaveTextContent("SupporterAdministrator · Level 101");
    expect(accountDetails.querySelector(".cjs-badge")).toBeNull();
    expect(accountDetails).not.toHaveTextContent("best FPS");
    const performanceSummary = screen.getByLabelText("Performance summary");
    expect(performanceSummary).toHaveTextContent("Route completion20 completed · 50%");
    expect(performanceSummary).toHaveTextContent("Best leaderboard placement#1");
    expect(performanceSummary).toHaveTextContent("Top-10 leaderboard placements5");
    expect(performanceSummary).toHaveTextContent("#1 leaderboard placements1");
    expect(performanceSummary).toHaveTextContent("Average leaderboard placement4.5");
    expect(performanceSummary).toHaveTextContent("Best record FPS250 FPS");
    expect(screen.getByRole("heading", { level: 3, name: "Records by FPS" })).toBeInTheDocument();
    expect(screen.getByText("Run attempts")).toBeInTheDocument();
    expect(screen.getByText("Playing AFK")).toBeInTheDocument();
    expect(screen.getByText("Nade throws")).toBeInTheDocument();
    expect(screen.getByText("First tracked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_recent" })).toHaveAttribute(
      "href",
      "/maps/654?source=j4l&lookup=cpid",
    );
    expect(screen.getByRole("link", { name: "mp_oldest" })).toHaveAttribute(
      "href",
      "/maps/655?source=j4l&lookup=cpid",
    );
    expect(screen.getByTitle("Second place achievement")).toHaveTextContent("#2");
    expect(screen.getByTitle("Top 10 achievement")).toHaveTextContent("#7");
    expect(screen.getByRole("link", { name: "mp_recent" }).closest("li")).not.toHaveAttribute(
      "data-achievement",
    );
    expect(screen.getByRole("link", { name: "mp_oldest" }).closest("div")).not.toHaveAttribute(
      "data-achievement",
    );
    expect(screen.getByRole("link", { name: "Best runs" })).toHaveAttribute(
      "href",
      "/players/42?fps=250&source=j4l&view=runs",
    );
    expect(screen.queryByRole("combobox", { name: "Leaderboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Surf skill" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Speed skill" })).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();

    const lifetimeActivity = screen.getByRole("heading", { name: "Lifetime activity" });
    const leaderboardPositions = screen.getByRole("heading", { name: "Leaderboard positions" });
    expect(
      lifetimeActivity.compareDocumentPosition(performanceHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      lifetimeActivity.compareDocumentPosition(recentActivity) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      lifetimeActivity.compareDocumentPosition(leaderboardPositions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const parameters = new URLSearchParams(window.location.search);
    expect(parameters.get("campaign")).toBe("summer");

    const accessibilityResults = await axe.run(container);
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("shows all 50 recent records in a keyboard-scrollable region", async () => {
    const recentTops: PlayerPerformanceStats["recent_tops"] = Array.from(
      { length: 50 },
      (_, index) => ({
        cpid: 700 + index,
        finish_date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        fps: "125",
        map_name: `mp_recent_${index + 1}`,
        rank: (index % 10) + 1,
        runid: 1_000 + index,
      }),
    );
    const apiClient = createProfileApi({
      playerPerformance: vi.fn().mockResolvedValue({ ...performance, recent_tops: recentTops }),
    });

    renderProfile(apiClient);

    const recentRecords = await screen.findByRole("region", { name: "50 recent records" });
    expect(recentRecords).toHaveClass("cjs-player-profile__recent-scroll");
    expect(screen.getByRole("list", { name: "Recent personal records" }).children).toHaveLength(50);
    expect(screen.getByRole("link", { name: "mp_recent_50" })).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("gates J4L-only requests while keeping the source capability visible", async () => {
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(apiClient.playerRank).not.toHaveBeenCalled();
    expect(apiClient.playerActivitySummary).not.toHaveBeenCalled();
    expect(apiClient.replayWatchAggregate).not.toHaveBeenCalled();
    expect(apiClient.replayWatchRankings).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 2, name: "JumpersHeaven profile" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find this player in Jump4Life" })).toHaveAttribute(
      "href",
      "/players?source=j4l",
    );
    expect(screen.queryByRole("heading", { name: "Jump4Life rank" })).not.toBeInTheDocument();
  });

  it("recovers JH identity from the directory and treats no placement as empty", async () => {
    const apiClient = createProfileApi({
      playerLeaderboardPositions: vi.fn().mockResolvedValue([]),
      playerPerformance: vi.fn().mockResolvedValue({ ...performance, rank: undefined }),
      players: vi.fn().mockResolvedValue([redsherpa]),
    });

    renderProfile(apiClient, "141172");

    expect(await screen.findByRole("heading", { level: 1, name: "REDsherpa" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ES" }).querySelector("img")).toHaveAttribute(
      "src",
      "/country-flags/es.svg",
    );
    expect(screen.queryByText("Last seen unknown")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not on the board… yet" })).toBeInTheDocument();
    expect(screen.getByText(/leaderboard hasn't learned this player's name/i)).toBeInTheDocument();
    expect(screen.queryByText("Some profile data is unavailable.")).not.toBeInTheDocument();
    expect(apiClient.players).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "last-seen", source: "jh" }),
    );
  });

  it("presents a sparse new-player profile without resource errors", async () => {
    const apiClient = createProfileApi({
      playerLeaderboardPositions: vi.fn().mockResolvedValue([]),
      playerPerformance: vi.fn().mockResolvedValue({
        ...performance,
        average_rank: null,
        best_fps: null,
        best_rank: null,
        days_since_last_seen: 0,
        maps_completed_ratio: 0.00473186119873817,
        nb_tops_per_fps: {},
        oldest_top: null,
        rank: undefined,
        recent_tops: [],
        top10_count: 0,
        top1_count: 0,
        total_maps_completed: 3,
      }),
    });

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(screen.queryByText("Some profile data is unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /unavailable/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Not ranked yet")).toHaveLength(3);
    expect(screen.getByText("3 completed · 0.47%")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/expected for new players/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not on the board… yet" })).toBeInTheDocument();
  });

  it("keeps successful sections usable when one endpoint fails", async () => {
    const apiClient = createProfileApi({
      playerPerformance: vi.fn().mockRejectedValue(new Error("performance timed out")),
    });

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(screen.getByText("Some profile data is unavailable.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Performance statistics unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leaderboard positions" })).toBeInTheDocument();
  });

  it("aborts pending overview requests when the profile unmounts", async () => {
    const signals: AbortSignal[] = [];
    const pending = vi.fn((options: { signal?: AbortSignal }) => {
      if (options.signal) signals.push(options.signal);
      return new Promise<never>(() => undefined);
    });
    const apiClient = createProfileApi({
      playerLeaderboardPositions: pending,
      playerPerformance: pending,
    });

    const { unmount } = renderProfile(apiClient);
    await waitFor(() => expect(signals).toHaveLength(2));
    unmount();

    await waitFor(() => {
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    });
  });

  it("loads best runs as an independent deep-linked view", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/players/42?source=jh&view=runs&fps=250");
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 2, name: "Best runs" })).toBeInTheDocument();
    expect(apiClient.playerJumpScores).toHaveBeenCalledWith(
      expect.objectContaining({ fps: "250", playerId: 42, source: "jh" }),
    );
    expect(apiClient.playerPerformance).not.toHaveBeenCalled();
    expect(apiClient.playerRoutes).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "mp_jump" })).toHaveAttribute(
      "href",
      "/maps/321?source=jh",
    );
    expect(screen.getByRole("columnheader", { name: "Skill points" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1,536" })).toBeInTheDocument();
    expect(screen.getByText("2,740")).toBeInTheDocument();
    expect(screen.getByTitle("First place achievement")).toHaveAttribute(
      "data-achievement",
      "first",
    );

    const fpsOptions = screen.getByRole("radiogroup", { name: "Best runs FPS" });
    expect(fpsOptions.querySelectorAll('[role="radio"]')).toHaveLength(FPS_VALUES.length);
    expect(screen.getByRole("radio", { name: "250 FPS" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("combobox", { name: "FPS" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "125 FPS" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "125 FPS" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(apiClient.playerJumpScores).toHaveBeenLastCalledWith(
        expect.objectContaining({ fps: "125", playerId: 42, source: "jh" }),
      );
    });
  });

  it("treats a player without jump scores as an empty best-runs view", async () => {
    window.history.replaceState(null, "", "/players/42?source=jh&view=runs&fps=125");
    const apiClient = createProfileApi({
      playerJumpScores: vi.fn().mockResolvedValue({
        ...jumpScores,
        map_scores: [],
        rank: 0,
        rating: 0,
        score: 0,
        top_list: {},
      }),
    });

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { name: "No ranked runs yet" })).toBeInTheDocument();
    expect(
      screen.getByText(/has not earned jump-skill points at 125 FPS yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile unavailable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the combined run-analytics filters available when the map list fails", async () => {
    window.history.replaceState(null, "", "/players/42?source=jh&view=progress&fps=125");
    const apiClient = createProfileApi({
      playerJumpScores: vi.fn().mockRejectedValue(new Error("Map list offline")),
    });

    const { container } = renderProfile(apiClient);

    const analyticsFilters = await screen.findByRole("group", { name: "Run analytics filters" });
    expect(
      within(analyticsFilters).getByRole("radiogroup", { name: "Run analytics FPS" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analytics maps unavailable" })).toBeInTheDocument();
    expect(container.querySelector(".cjs-run-progress")).toHaveAttribute(
      "data-map-selected",
      "false",
    );
    expect(screen.queryByRole("heading", { name: "Profile unavailable" })).not.toBeInTheDocument();
  });

  it("charts a deep-linked map history with a complete run ledger and selectable details", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/players/42?source=jh&view=progress&fps=125&map=321");
    const apiClient = createProfileApi({
      playerMapRuns: vi.fn().mockResolvedValue([
        {
          ...mapRuns[0],
          cpid: 321,
          rank: 2,
          run_id: 7_000,
          time_created: "2025-12-01T00:00:00Z",
          time_played_string: "0:20.00",
        },
        {
          ...mapRuns[0],
          cpid: 321,
          rank: 1,
          run_id: 7_001,
          time_created: "2026-01-02T03:04:05Z",
          time_played_string: "0:12.34",
        },
      ]),
    });

    const { container } = renderProfile(apiClient);

    expect(
      await screen.findByRole("heading", { level: 2, name: "mp_jump progression" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".cjs-run-progress")).toHaveAttribute(
      "data-map-selected",
      "true",
    );
    const analyticsFilters = screen.getByRole("group", { name: "Run analytics filters" });
    expect(
      within(analyticsFilters).getByRole("radiogroup", { name: "Run analytics FPS" }),
    ).toBeInTheDocument();
    expect(
      within(analyticsFilters).getByRole("searchbox", { name: "Find a ranked map" }),
    ).toBeInTheDocument();
    expect(within(analyticsFilters).getByRole("combobox", { name: "Map" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Finish-time trend" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run analytics" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(apiClient.playerMapRuns).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: 321, fps: "125", playerId: 42, source: "jh" }),
    );
    expect(apiClient.playerPerformance).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Run improvement summary")).toHaveTextContent(
      "Total improvement0:07.66 · 38%",
    );
    expect(
      screen.getByRole("group", { name: "Interactive finish-time chart" }),
    ).toBeInTheDocument();
    const chart = screen.getByRole("group", { name: "Interactive finish-time chart" });
    expect(within(chart).getByText("Dec 1, 2025")).toBeInTheDocument();
    expect(within(chart).getByText("Jan 2, 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "mp_jump run progression from oldest to newest" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Selected run #2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run 1: 0:20.00, personal best" }));
    expect(screen.getByText("Selected run #1")).toBeInTheDocument();

    const accessibilityResults = await axe.run(container);
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("loads route completion as an independent deep-linked view", async () => {
    window.history.replaceState(null, "", "/players/42?source=j4l&view=routes");
    const user = userEvent.setup();
    const apiClient = createProfileApi();

    const { container } = renderProfile(apiClient);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Route completion" }),
    ).toBeInTheDocument();
    expect(apiClient.playerRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 42, source: "j4l" }),
    );
    expect(apiClient.maps).toHaveBeenCalledWith(
      expect.objectContaining({ source: "j4l", signal: expect.any(AbortSignal) }),
    );
    expect(apiClient.playerPerformance).not.toHaveBeenCalled();
    expect(apiClient.playerJumpScores).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Route completion summary")).toHaveTextContent(
      "Completed1Remaining1Published routes2Total finishes2",
    );
    expect(
      screen.getByRole("progressbar", { name: "50% of published routes completed" }),
    ).toHaveValue(50);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Completed FPS" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "125, 250 FPS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_route" })).toHaveAttribute(
      "href",
      "/maps/17?source=j4l",
    );
    expect(screen.getByRole("link", { name: "mp_remaining" })).toHaveAttribute(
      "href",
      "/maps/18?source=j4l",
    );

    await user.click(screen.getByRole("radio", { name: "1 remaining routes" }));
    expect(window.location.search).toContain("status=remaining");
    expect(screen.queryByRole("link", { name: "mp_route" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_remaining" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search routes" }), "remaining");
    expect(window.location.search).toContain("q=remaining");

    const accessibilityResults = await axe.run(container);
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("keeps completed routes usable when the map catalog fails", async () => {
    window.history.replaceState(null, "", "/players/42?source=j4l&view=routes");
    const apiClient = createProfileApi({
      maps: vi.fn().mockRejectedValue(new Error("Map catalog offline")),
    });

    renderProfile(apiClient);

    expect(await screen.findByText(/map catalog could not be loaded/i)).toHaveTextContent(
      /remaining and total counts are unavailable/i,
    );
    expect(screen.getByRole("link", { name: "mp_route" })).toBeInTheDocument();
    expect(screen.getByLabelText("Route completion summary")).toHaveTextContent(
      "Completed1RemainingUnavailablePublished routesUnavailableTotal finishes2",
    );
    expect(screen.getByRole("radio", { name: "Remaining routes unavailable" })).toBeDisabled();
    expect(screen.queryByText("Historical")).not.toBeInTheDocument();
  });

  it("renders a deleted or unavailable player state after a 404", async () => {
    const apiClient = createProfileApi({
      playerLeaderboardPositions: vi.fn().mockResolvedValue([]),
      playerPerformance: vi.fn().mockRejectedValue(
        new ApiError({
          kind: "http",
          message: "API request failed (404) for /api/v1/player/performance-stats",
          path: "/api/v1/player/performance-stats",
          status: 404,
        }),
      ),
      playerRoutes: vi.fn().mockResolvedValue([]),
      playerJumpScores: vi.fn().mockResolvedValue(jumpScores),
      players: vi.fn().mockResolvedValue([]),
    });

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { name: "Player unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/may have been removed/i)).toBeInTheDocument();
  });

  it("rejects malformed deep links without making API requests", () => {
    const apiClient = createProfileApi();

    renderProfile(apiClient, "not-a-player");

    expect(screen.getByRole("heading", { name: "Invalid player link" })).toBeInTheDocument();
    expect(apiClient.playerPerformance).not.toHaveBeenCalled();
  });
});

function renderProfile(apiClient: PlayerProfileApi, playerId = "42") {
  return render(
    <SourceProvider>
      <PlayerDetailPage apiClient={apiClient} playerId={playerId} />
    </SourceProvider>,
  );
}

function createProfileApi(overrides: Partial<PlayerProfileApi> = {}): PlayerProfileApi {
  return {
    maps: vi.fn().mockResolvedValue(routeMaps),
    playerActivitySummary: vi.fn().mockResolvedValue(activity),
    playerJumpScores: vi.fn().mockResolvedValue(jumpScores),
    playerLeaderboardPositions: vi.fn().mockResolvedValue([position]),
    playerMapRuns: vi.fn().mockResolvedValue(mapRuns),
    playerPerformance: vi.fn().mockResolvedValue(performance),
    playerRank: vi.fn().mockResolvedValue(rank),
    replayWatchAggregate: vi.fn().mockResolvedValue(replayAggregate),
    replayWatchRankings: vi.fn().mockResolvedValue([replayRanking]),
    playerRoutes: vi.fn().mockResolvedValue([route]),
    players: vi.fn().mockResolvedValue([directoryPlayer]),
    ...overrides,
  };
}

const replayAggregate: ReplayWatchAggregate = {
  owner_player_id: 42,
  replay_count: 2,
  watch_count: 18,
  unique_viewer_count: 11,
  total_watch_ms: 420_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

const replayRanking: ReplayWatchRankingEntry = {
  rank: 1,
  run_id: 7001,
  fps: "125",
  mapid: 101,
  owner_player_id: 42,
  mapname: "mp_cjs_training",
  owner_playername: "^2Runner^7One",
  country: "Testland",
  watch_count: 12,
  unique_viewer_count: 8,
  total_watch_ms: 300_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

const mapRuns: TopRun[] = [
  {
    cpid: 101,
    fps: "125",
    load_count: 4,
    mapname: "mp_cjs_training",
    player_id: 42,
    playername: "^2Runner^7One",
    rank: 1,
    run_id: 7_001,
    save_count: 2,
    score: 100,
    time_created: "2026-01-02T03:04:05Z",
    time_played: 12,
    time_played_string: "0:12.34",
    type: "jump",
  },
];

const directoryPlayer: Player = {
  country: "TL",
  last_seen: "2026-08-01T00:00:00Z",
  player_id: 42,
  playername: "^2Runner^7One",
};

const redsherpa: Player = {
  admin: 40,
  country: "ES",
  last_seen: "2026-08-30 00:58:54",
  player_id: 141172,
  playername: "REDsherpa",
  visits: 874,
};

const rank: PlayerRankInfo = {
  country: "Testland",
  country_code: "TL",
  last_seen: "2026-08-01T00:00:00Z",
  level: 8,
  level_display: "8",
  maxed: false,
  player_id: 42,
  player_name: "^2Runner^7One",
  prestige: 1,
  region: "EU",
  title: "Jumper",
  total_xp: 12_000,
  xp_for_level: 2_000,
  xp_into_level: 500,
  xp_to_next: 1_500,
};

const performance: PlayerPerformanceStats = {
  activity_level: "Active",
  admin_level: 0,
  average_rank: 4.5,
  best_fps: "250",
  best_rank: 1,
  days_since_last_seen: 2,
  is_banned: false,
  is_donator: true,
  maps_completed_ratio: 0.5,
  nb_tops_per_fps: { "250": 2 },
  oldest_top: {
    cpid: 655,
    finish_date: "2025-01-12T00:00:00Z",
    fps: "125",
    map_name: "mp_oldest",
    rank: 7,
    runid: 12,
  },
  rank,
  recent_tops: [
    {
      cpid: 654,
      finish_date: "2026-07-31T00:00:00Z",
      fps: "250",
      map_name: "mp_recent",
      rank: 2,
      runid: 99,
    },
  ],
  top10_count: 5,
  top1_count: 1,
  total_maps_completed: 20,
};

const position: PlayerLeaderboardPosition = {
  country: "Testland",
  country_code: "TL",
  fps: "250",
  last_seen: "2026-08-01T00:00:00Z",
  leaderboard_type: "surf",
  player_name: "^2Runner^7One",
  rank: 3,
  rating: 42,
  region: "EU",
  score: 900,
};

const jumpScores: PlayerJumpScores = {
  country: "Testland",
  country_code: "TL",
  last_seen: "2026-08-01T00:00:00Z",
  map_scores: [
    {
      difficulty: 9.7588,
      map_id: 321,
      map_name: "mp_jump",
      rank: 1,
      score: 1_536,
    },
  ],
  player_id: 42,
  player_name: "^2Runner^7One",
  rank: 4,
  rating: 812.5,
  region: "EU",
  score: 2_740,
  top_list: { "1": 1 },
};

const route: PlayerRouteCompletion = {
  ender: "finish",
  fps_list: ["125", "250"],
  map_id: 17,
  map_name: "mp_route",
  player_id: 42,
  player_name: "^2Runner^7One",
  total_finishes: 2,
};

const routeMaps: GameMap[] = [
  {
    cp_id: 117,
    ender: "finish",
    mapid: 17,
    mapname: "mp_route",
    type: "jump",
  },
  {
    cp_id: 118,
    ender: "hard",
    mapid: 18,
    mapname: "mp_remaining",
    type: "jump",
  },
];

const activity: PlayerActivitySummary = {
  afk_ms: 60_000,
  distance_travelled: 98_765,
  first_activity_at: "2025-01-01T00:00:00Z",
  jump_count: 4_000,
  last_activity_at: "2026-08-01T00:00:00Z",
  load_count: 20,
  nadejumps: 5,
  nadethrows: 8,
  player_id: 42,
  playing_afk_ms: 20_000,
  playing_ms: 7_200_000,
  run_attempt_ms: 300_000,
  runtime_ms: 480_000,
  save_count: 10,
  spectating_afk_ms: 40_000,
  spectating_ms: 500_000,
  updated_at: "2026-08-01T00:00:00Z",
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}
