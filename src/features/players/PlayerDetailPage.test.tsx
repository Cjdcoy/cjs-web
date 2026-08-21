import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  FPS_VALUES,
  type PlayerActivitySummary,
  type PlayerJumpScores,
  type PlayerLeaderboardPosition,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
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

  it("loads a URL-backed J4L overview with richer activity and recent records", async () => {
    window.history.replaceState(
      null,
      "",
      "/players/42?source=j4l&fps=250&board=surf&campaign=summer",
    );
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(await screen.findByRole("heading", { level: 1, name: "RunnerOne" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Testland" }).querySelector("img")).toHaveAttribute(
      "src",
      "/country-flags/tl.svg",
    );
    expect(apiClient.playerLeaderboardPositions).toHaveBeenCalledWith(
      expect.objectContaining({ fps: "250", leaderboard: "surf", playerId: 42, source: "j4l" }),
    );
    expect(apiClient.playerJumpScores).not.toHaveBeenCalled();
    expect(apiClient.playerRoutes).not.toHaveBeenCalled();
    expect(apiClient.playerRank).toHaveBeenCalledOnce();
    expect(apiClient.playerActivitySummary).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 2, name: "Performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Recent activity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Jump4Life rank" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "mp_recent" })).toHaveAttribute(
      "href",
      "/maps/654?source=j4l&lookup=cpid",
    );
    expect(screen.getByRole("link", { name: "Best runs" })).toHaveAttribute(
      "href",
      "/players/42?board=surf&fps=250&source=j4l&view=runs",
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
      screen.getByRole("heading", { level: 2, name: "JumpersHeaven profile" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find this player in Jump4Life" })).toHaveAttribute(
      "href",
      "/players?source=j4l",
    );
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
    expect(screen.getByRole("heading", { name: "Leaderboard position" })).toBeInTheDocument();
  });

  it("aborts overview requests when its leaderboard filter changes", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const pending = vi.fn((options: { signal?: AbortSignal }) => {
      if (options.signal) signals.push(options.signal);
      return new Promise<never>(() => undefined);
    });
    const apiClient = createProfileApi({
      playerLeaderboardPositions: pending,
      playerPerformance: pending,
    });

    renderProfile(apiClient);
    await waitFor(() => expect(signals).toHaveLength(2));
    const firstRequestSignals = [...signals];

    await user.selectOptions(screen.getByLabelText("Leaderboard"), "surf");

    await waitFor(() => {
      expect(firstRequestSignals.every((signal) => signal.aborted)).toBe(true);
      expect(signals.length).toBeGreaterThan(2);
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

  it("loads route completion as an independent deep-linked view", async () => {
    window.history.replaceState(null, "", "/players/42?source=j4l&view=routes");
    const apiClient = createProfileApi();

    renderProfile(apiClient);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Route completion" }),
    ).toBeInTheDocument();
    expect(apiClient.playerRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 42, source: "j4l" }),
    );
    expect(apiClient.playerPerformance).not.toHaveBeenCalled();
    expect(apiClient.playerJumpScores).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "mp_route" })).toHaveAttribute(
      "href",
      "/maps/17?source=j4l",
    );
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
    playerJumpScores: vi.fn().mockResolvedValue(jumpScores),
    playerLeaderboardPositions: vi.fn().mockResolvedValue([position]),
    playerPerformance: vi.fn().mockResolvedValue(performance),
    playerRank: vi.fn().mockResolvedValue(rank),
    playerRoutes: vi.fn().mockResolvedValue([route]),
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
