import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type PlayerActivitySummary,
  type PlayerLeaderboardPosition,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type TopRun,
} from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { PlayerDetailPage } from "./PlayerDetailPage";
import type { PlayerProfileApi } from "./usePlayerProfile";

describe("PlayerDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    window.history.replaceState(null, "", "/players/42");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a URL-backed J4L deep link, preserves heading order, and links profile maps", async () => {
    window.history.replaceState(
      null,
      "",
      "/players/42?source=j4l&fps=250&board=surf&campaign=summer",
    );
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(apiClient.playerTops).toHaveBeenCalledWith(
      expect.objectContaining({ fps: "250", limit: 25, playerId: 42, source: "j4l" }),
    );
    expect(apiClient.playerLeaderboardPositions).toHaveBeenCalledWith(
      expect.objectContaining({ fps: "250", leaderboard: "surf", playerId: 42, source: "j4l" }),
    );
    expect(apiClient.playerRank).toHaveBeenCalledOnce();
    expect(apiClient.playerActivitySummary).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 2, name: "Performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Jump4Life rank" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_jump" })).toHaveAttribute(
      "href",
      "/maps/321?source=j4l&lookup=cpid",
    );
    expect(screen.getByRole("link", { name: "mp_route" })).toHaveAttribute(
      "href",
      "/maps/17?source=j4l",
    );

    const parameters = new URLSearchParams(window.location.search);
    expect(parameters.get("campaign")).toBe("summer");
  });

  it("gates J4L-only requests while keeping the source capability visible", async () => {
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(apiClient.playerRank).not.toHaveBeenCalled();
    expect(apiClient.playerActivitySummary).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 2, name: "Rank and lifetime activity" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Jump4Life rank" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "mp_jump" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_route" })).toBeInTheDocument();
  });

  it("aborts every common request when the source changes", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const pending = vi.fn((options: { signal?: AbortSignal }) => {
      if (options.signal) signals.push(options.signal);
      return new Promise<never>(() => undefined);
    });
    const apiClient = createProfileApi({
      playerLeaderboardPositions: pending,
      playerPerformance: pending,
      playerRoutes: pending,
      playerTops: pending,
    });

    renderProfile(apiClient);
    await waitFor(() => expect(signals).toHaveLength(4));
    const firstRequestSignals = [...signals];

    await user.selectOptions(screen.getByLabelText("Data source"), "j4l");

    await waitFor(() => {
      expect(firstRequestSignals.every((signal) => signal.aborted)).toBe(true);
      expect(signals.length).toBeGreaterThan(4);
    });
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
      playerTops: vi.fn().mockResolvedValue([]),
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
    playerActivitySummary: vi.fn().mockResolvedValue(activity),
    playerLeaderboardPositions: vi.fn().mockResolvedValue([position]),
    playerPerformance: vi.fn().mockResolvedValue(performance),
    playerRank: vi.fn().mockResolvedValue(rank),
    playerRoutes: vi.fn().mockResolvedValue([route]),
    playerTops: vi.fn().mockResolvedValue([topRun]),
    ...overrides,
  };
}

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
  oldest_top: null,
  rank,
  recent_tops: [],
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

const topRun: TopRun = {
  cpid: 321,
  fps: "250",
  mapname: "mp_jump",
  player_id: 42,
  playername: "^2Runner^7One",
  rank: 1,
  run_id: 7,
  score: 100,
  time_created: "2026-08-01T00:00:00Z",
  time_played: 12_345,
  time_played_string: "00:12.345",
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
