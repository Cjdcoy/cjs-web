import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../app/AppRouter";
import {
  api,
  type GameMap,
  type ReplayWatchAggregate,
  type ReplayWatchRankingEntry,
  type TopRun,
} from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { MapDetailPage } from "./MapDetailPage";

const alphaCheckpoints: GameMap[] = [
  {
    mapid: 1,
    mapname: "mp_alpha",
    cp_id: 101,
    ender: "main",
    author: "First Mapper",
    released: "2025-01-01T00:00:00Z",
    type: "jump",
    difficulty: {
      "125": { difficulty: 2, nb_tops: 15 },
      "333": { difficulty: 3.5, nb_tops: 6 },
    },
    individual_finish_count: 30,
    video: null,
  },
  {
    mapid: 1,
    mapname: "mp_alpha",
    cp_id: 102,
    ender: "bonus",
    author: null,
    released: null,
    type: null,
    difficulty: {
      "125": { difficulty: 4, nb_tops: 8 },
      "333": { difficulty: 5.5, nb_tops: 3 },
    },
    individual_finish_count: 12,
    video: "https://media.example.invalid/maps/mp_alpha",
  },
];

const betaMap: GameMap = {
  mapid: 2,
  mapname: "mp_beta",
  cp_id: 201,
  author: "Second Mapper",
  released: "2026-01-01T00:00:00Z",
  type: "surf",
  difficulty: { "125": { difficulty: 7, nb_tops: 2 } },
  individual_finish_count: 10,
  video: "javascript:alert('blocked')",
};

const alphaRun = topRun({
  player_id: 7,
  playername: "^1Alpha ^2Runner",
  cpid: 102,
  fps: "333",
  run_id: 700,
});
const betaRun = topRun({
  player_id: 8,
  playername: "Beta Runner",
  cpid: 201,
  run_id: 800,
});

const storageValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => storageValues.delete(key),
  setItem: (key, value) => storageValues.set(key, value),
};

function renderMapDetail(mapId = "1") {
  return render(
    <SourceProvider>
      <MapDetailPage mapId={mapId} />
    </SourceProvider>,
  );
}

describe("MapDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", localStorageMock);
    vi.spyOn(api, "replayWatchAggregate").mockResolvedValue(replayAggregate);
    vi.spyOn(api, "replayWatchRankings").mockResolvedValue([replayRanking]);
    localStorage.clear();
    window.history.replaceState(null, "", "/maps/1");
  });

  it("loads a source-stable checkpoint and FPS deep link with player and media links", async () => {
    const mapsRequest = vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    window.history.replaceState(null, "", "/maps/1?source=j4l&fps=333&cp=102");

    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "mp_alpha", level: 1 })).toBeVisible();
    expect(document.querySelector(".cjs-map-detail__badges")).not.toBeInTheDocument();
    const mapHero = document.querySelector(".cjs-map-detail__hero");
    expect(mapHero?.querySelector(".cjs-map-detail__summary")).toBeInTheDocument();
    expect(
      document.querySelector(".cjs-map-detail__controls + .cjs-map-detail__summary"),
    ).not.toBeInTheDocument();
    expect(mapsRequest).toHaveBeenCalledWith({
      source: "j4l",
      signal: expect.any(AbortSignal),
    });
    await waitFor(() =>
      expect(topsRequest).toHaveBeenCalledWith({
        source: "j4l",
        checkpointId: 102,
        fps: "333",
        limit: 100,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      within(screen.getByRole("radiogroup", { name: "Route" })).getByRole("radio", {
        name: "bonus",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Route: bonus")).toBeVisible();
    expect(
      within(screen.getByRole("radiogroup", { name: "Top runs FPS" })).getByRole("radio", {
        name: "333",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Map author not available")).toBeVisible();
    expect(screen.getByText("Release date unavailable")).toBeVisible();
    const mapImage = document.querySelector<HTMLImageElement>(".cjs-map-detail__art img");
    expect(mapImage).toHaveAttribute("src", "/maps/cards/mp_alpha.avif");
    expect(mapImage).toHaveAttribute(
      "srcset",
      "/maps/thumbs/mp_alpha.avif 480w, /maps/cards/mp_alpha.avif 960w",
    );
    const playerLink = await screen.findByRole("link", { name: "Alpha Runner" });
    expect(playerLink).toHaveAttribute("href", "/players/7?source=j4l");
    expect(playerLink).toHaveAttribute("data-variant", "player");
    expect(document.querySelector('[data-cod-color="1"]')).toHaveTextContent("Alpha");
    expect(document.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(screen.getByRole("link", { name: /Watch map video/ })).toHaveAttribute(
      "href",
      "https://media.example.invalid/maps/mp_alpha",
    );
    expect(await screen.findByRole("heading", { name: "Replay views" })).toBeVisible();
    await waitFor(() =>
      expect(api.replayWatchAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ mapId: 1, source: "j4l" }),
      ),
    );
    expect(api.replayWatchRankings).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1, mapId: 1, metric: "watch_count", source: "j4l" }),
    );
    const resultsLayout = document.querySelector(".cjs-map-detail__results-layout");
    expect(resultsLayout).toHaveAttribute("data-has-replay", "true");
    expect(resultsLayout).toHaveAttribute("data-has-sidebar", "true");
    expect(resultsLayout?.children).toHaveLength(2);
    expect(resultsLayout?.firstElementChild).toHaveClass("cjs-map-detail__insights");
    expect(
      within(screen.getByRole("complementary", { name: "Map insights" })).getByRole("heading", {
        name: "Replay views",
      }),
    ).toBeVisible();
    expect(resultsLayout?.lastElementChild).toHaveClass("cjs-map-detail__runs");
    expect(screen.getByText("Most watched replay")).toBeVisible();
    expect(screen.getByRole("link", { name: "Replay Runner" })).toBeVisible();

    if (!mapImage) throw new Error("Expected the map profile image to render.");
    fireEvent.error(mapImage);
    expect(document.querySelector(".cjs-map-detail__art img")).not.toBeInTheDocument();
    expect(screen.getByText("MP")).toBeVisible();
  });

  it("shows the same map-name video catalog for JumpersHeaven and Jump4Life", async () => {
    const chilliMap = { ...alphaCheckpoints[0], mapname: "mp_chilli", video: null };
    const mapsRequest = vi.spyOn(api, "maps").mockResolvedValue([chilliMap]);
    vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/maps/1?source=j4l");

    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "Map videos" })).toBeVisible();
    expect(screen.queryByText(/videos available for mp_chilli/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 map videos" })).toHaveAttribute(
      "href",
      "#map-videos",
    );
    const j4lInsights = screen.getByRole("complementary", { name: "Map insights" });
    expect(j4lInsights.children).toHaveLength(2);
    expect(j4lInsights.firstElementChild).toHaveAttribute("data-scope", "map");
    expect(j4lInsights.lastElementChild).toHaveClass("cjs-map-videos");

    await user.click(
      within(screen.getByRole("radiogroup", { name: "Map data source" })).getByRole("radio", {
        name: "JumpersHeaven",
      }),
    );

    await waitFor(() =>
      expect(mapsRequest).toHaveBeenLastCalledWith({
        source: "jh",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByRole("heading", { name: "Map videos" })).toBeVisible();
    expect(screen.queryByText(/videos available for mp_chilli/i)).not.toBeInTheDocument();
    const jhResultsLayout = document.querySelector(".cjs-map-detail__results-layout");
    expect(jhResultsLayout).not.toHaveAttribute("data-has-replay");
    expect(jhResultsLayout).toHaveAttribute("data-has-sidebar", "true");
    expect(jhResultsLayout?.children).toHaveLength(2);
    const jhInsights = screen.getByRole("complementary", { name: "Map insights" });
    expect(jhResultsLayout?.firstElementChild).toBe(jhInsights);
    expect(jhInsights.children).toHaveLength(1);
    expect(jhInsights.firstElementChild).toHaveClass("cjs-map-videos");
    expect(jhResultsLayout?.lastElementChild).toHaveClass("cjs-map-detail__runs");
  });

  it("renders through the application router on a direct nested-route load", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([alphaCheckpoints[0]]);
    vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    window.history.replaceState(null, "", "/maps/1?source=j4l&fps=333");

    render(<AppRouter />);

    expect(await screen.findByRole("heading", { name: "mp_alpha", level: 1 })).toBeVisible();
    expect(
      within(screen.getByRole("radiogroup", { name: "Map data source" })).getByRole("radio", {
        name: "Jump4Life",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByRole("radiogroup", { name: "Top runs FPS" })).getByRole("radio", {
        name: "333",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radiogroup", { name: "Route" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Route 1/)).not.toBeInTheDocument();
  });

  it("loads Most played lazily per route, sums every FPS for All and caches each FPS", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    vi.spyOn(api, "mapTops").mockResolvedValue([
      alphaRun,
      topRun({ player_id: 7, playername: "Slower Alpha", rank: 4 }),
    ]);
    const playtimeRequest = vi.spyOn(api, "mapPlayersPlaytime").mockImplementation(({ fps }) =>
      Promise.resolve(
        fps === "125"
          ? [
              { player_id: 7, player_name: "^1Alpha ^2Runner", time_played: 3_600 },
              { player_id: 8, player_name: "Beta Runner", time_played: 4_000 },
            ]
          : fps === "333"
            ? [{ player_id: 7, player_name: "^1Alpha ^2Runner", time_played: 1_500 }]
            : [],
      ),
    );
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/maps/1?source=j4l&cp=102");

    renderMapDetail();
    await screen.findByRole("heading", { name: "Top runs at 125 FPS" });
    expect(playtimeRequest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Most played" }));

    expect(
      await screen.findByRole("heading", { name: "Most played at all FPS (on route bonus)" }),
    ).toBeVisible();
    expect(window.location.search).toContain("view=played");
    expect(playtimeRequest.mock.calls.map(([options]) => options.fps)).toEqual([
      "125",
      "250",
      "333",
      "0",
    ]);
    expect(playtimeRequest).toHaveBeenCalledWith({
      source: "j4l",
      mapId: 1,
      fps: "125",
      ender: "bonus",
      limit: 100,
    });
    const allTable = await screen.findByRole("table", {
      name: /by playtime on mp_alpha at all FPS/,
    });
    const allRows = within(allTable).getAllByRole("row").slice(1);
    expect(allRows[0]).toHaveAccessibleName("Rank 1, Alpha Runner");
    expect(within(allRows[0]).getByText("1h 25m")).toBeVisible();
    expect(within(allRows[0]).getByText("125, 333")).toBeVisible();
    expect(allRows[1]).toHaveAccessibleName("Rank 2, Beta Runner");
    expect(within(allRows[1]).getByText("1h 06m")).toBeVisible();
    expect(within(allRows[0]).getByRole("link", { name: "Alpha Runner" })).toHaveAttribute(
      "href",
      "/players/7?source=j4l",
    );

    await user.click(
      within(screen.getByRole("radiogroup", { name: "Most played FPS" })).getByRole("radio", {
        name: "333",
      }),
    );
    const fpsTable = await screen.findByRole("table", { name: /at 333 FPS/ });
    expect(
      within(fpsTable).getByRole("columnheader", { name: "Best time on route" }),
    ).toBeVisible();
    expect(within(fpsTable).getByText("20.951 (#1)")).toBeVisible();
    expect(api.mapTops).toHaveBeenLastCalledWith(
      expect.objectContaining({ checkpointId: 102, fps: "333" }),
    );

    await user.click(
      within(screen.getByRole("radiogroup", { name: "Most played FPS" })).getByRole("radio", {
        name: "All FPS combined",
      }),
    );
    await screen.findByRole("table", { name: /at all FPS/ });
    expect(playtimeRequest).toHaveBeenCalledTimes(4);

    await user.click(screen.getByRole("radio", { name: "main" }));
    expect(
      await screen.findByRole("heading", { name: "Most played at all FPS (on route main)" }),
    ).toBeVisible();
    expect(playtimeRequest).toHaveBeenCalledTimes(8);
    expect(playtimeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ ender: "main" }));
  });

  it("shows an empty Most played state for JumpersHeaven maps without playtime", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([betaMap]);
    vi.spyOn(api, "mapTops").mockResolvedValue([betaRun]);
    vi.spyOn(api, "mapPlayersPlaytime").mockResolvedValue([]);
    window.history.replaceState(null, "", "/maps/2?view=played&pfps=125");

    renderMapDetail("2");

    expect(
      await screen.findByRole("heading", { name: "No playtime recorded at 125 FPS on mp_beta" }),
    ).toBeVisible();
    expect(api.mapPlayersPlaytime).toHaveBeenCalledWith({
      source: "jh",
      mapId: 2,
      fps: "125",
      limit: 100,
    });
  });

  it("shows route selection only for multi-route maps and requests the selected route", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    const user = userEvent.setup();

    renderMapDetail();
    await screen.findByRole("heading", { name: "mp_alpha", level: 1 });
    const routes = screen.getByRole("radiogroup", { name: "Route" });
    expect(within(routes).getByRole("radio", { name: "main" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(routes).getByRole("radio", { name: "bonus" })).toBeVisible();
    await user.click(within(routes).getByRole("radio", { name: "bonus" }));

    await waitFor(() => {
      expect(window.location.search).toContain("cp=102");
      expect(topsRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ checkpointId: 102, fps: "125" }),
      );
    });
    expect(api.maps).toHaveBeenCalledTimes(1);
  });

  it("falls back to a route dropdown when a map has more than six routes", async () => {
    const routes = Array.from({ length: 7 }, (_, index) => ({
      ...alphaCheckpoints[0],
      cp_id: 101 + index,
      ender: index === 6 ? null : `route-${index + 1}`,
    }));
    vi.spyOn(api, "maps").mockResolvedValue(routes);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    const user = userEvent.setup();

    renderMapDetail();
    const routeSelect = await screen.findByRole("combobox", { name: "Route" });
    expect(screen.queryByRole("radiogroup", { name: "Route" })).not.toBeInTheDocument();
    expect(within(routeSelect).getByRole("option", { name: "Route 7" })).toBeInTheDocument();
    await user.selectOptions(routeSelect, "103");

    await waitFor(() =>
      expect(topsRequest).toHaveBeenLastCalledWith(expect.objectContaining({ checkpointId: 103 })),
    );
    expect(screen.getByText("Route: route-3")).toBeVisible();
  });

  it("cancels an obsolete route request and never presents it as the new map", async () => {
    const firstMaps = deferred<GameMap[]>();
    let firstSignal: AbortSignal | undefined;
    vi.spyOn(api, "maps")
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return firstMaps.promise;
      })
      .mockResolvedValueOnce([betaMap]);
    vi.spyOn(api, "mapTops").mockResolvedValue([betaRun]);

    const view = renderMapDetail("1");
    await waitFor(() => expect(firstSignal).toBeDefined());

    view.rerender(
      <SourceProvider>
        <MapDetailPage mapId="2" />
      </SourceProvider>,
    );

    expect(await screen.findByRole("heading", { name: "mp_beta", level: 1 })).toBeVisible();
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByText("No verified media link")).toBeVisible();

    await act(async () => firstMaps.resolve(alphaCheckpoints));

    expect(screen.queryByRole("heading", { name: "mp_alpha", level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beta Runner" })).toBeVisible();
  });

  it("cancels an obsolete FPS request and does not show its late result", async () => {
    const firstRuns = deferred<TopRun[]>();
    let firstSignal: AbortSignal | undefined;
    const staleRun = topRun({ player_id: 9, playername: "Stale Runner", run_id: 900 });
    const freshRun = topRun({
      player_id: 10,
      playername: "Fresh Runner",
      fps: "333",
      run_id: 1000,
    });
    vi.spyOn(api, "maps").mockResolvedValue([alphaCheckpoints[0]]);
    vi.spyOn(api, "mapTops")
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return firstRuns.promise;
      })
      .mockResolvedValueOnce([freshRun]);
    const user = userEvent.setup();

    renderMapDetail();
    await waitFor(() => expect(firstSignal).toBeDefined());
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Top runs FPS" })).getByRole("radio", {
        name: "333",
      }),
    );

    expect(await screen.findByRole("link", { name: "Fresh Runner" })).toBeVisible();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => firstRuns.resolve([staleRun]));

    expect(screen.queryByRole("link", { name: "Stale Runner" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fresh Runner" })).toBeVisible();
    expect(window.location.search).toContain("fps=333");
  });

  it("keeps map metadata usable when the top-runs request fails", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([alphaCheckpoints[0]]);
    vi.spyOn(api, "mapTops")
      .mockRejectedValueOnce(new Error("Runs unavailable"))
      .mockResolvedValueOnce([alphaRun]);
    const user = userEvent.setup();

    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "mp_alpha", level: 1 })).toBeVisible();
    expect(
      await screen.findByRole("heading", {
        name: "Top runs could not be loaded for 125 FPS on mp_alpha",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Runs unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("30")).toBeVisible();
    expect(screen.getByText("Recorded tops").nextElementSibling).toHaveTextContent("15");

    await user.click(screen.getByRole("button", { name: "Retry top runs" }));
    expect(await screen.findByRole("link", { name: "Alpha Runner" })).toBeVisible();
  });

  it("prefers the live leaderboard total over stale map metadata", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([alphaCheckpoints[0]]);
    vi.spyOn(api, "mapTops").mockResolvedValue([{ ...alphaRun, fps: "125", totalNr: 29 }]);

    renderMapDetail();

    expect(await screen.findByRole("link", { name: "Alpha Runner" })).toBeVisible();
    expect(screen.getByText("Recorded tops").nextElementSibling).toHaveTextContent("29");
  });

  it("disables FPS values without tops and falls back from 125 to the first available FPS", async () => {
    const fallbackMap: GameMap = {
      ...alphaCheckpoints[0],
      difficulty: {
        "125": { difficulty: 2, nb_tops: 0 },
        "250": { difficulty: 3, nb_tops: 4 },
        "333": { difficulty: 4, nb_tops: 2 },
        "0": { difficulty: 5, nb_tops: 1 },
      },
    };
    vi.spyOn(api, "maps").mockResolvedValue([fallbackMap]);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);

    renderMapDetail();

    const fpsControl = await screen.findByRole("radiogroup", { name: "Top runs FPS" });
    const fps125 = within(fpsControl).getByRole("radio", {
      name: "125, no tops available",
    });
    const fps250 = within(fpsControl).getByRole("radio", { name: "250" });
    expect(fps125).toBeDisabled();
    expect(fps250).toHaveAttribute("aria-checked", "true");
    expect(within(fpsControl).getByRole("radio", { name: "333" })).toBeEnabled();
    expect(within(fpsControl).getByRole("radio", { name: "Mix" })).toBeEnabled();
    await waitFor(() => {
      expect(topsRequest).toHaveBeenCalledWith(expect.objectContaining({ fps: "250" }));
      expect(window.location.search).toContain("fps=250");
    });
  });

  it("falls back to disabled 125 and skips the tops request when no FPS has tops", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([
      {
        ...alphaCheckpoints[0],
        difficulty: {
          "125": { difficulty: -2, nb_tops: 0 },
          "250": { difficulty: 3, nb_tops: 0 },
          "333": { difficulty: 4, nb_tops: 0 },
          "0": { difficulty: 5, nb_tops: 0 },
        },
      },
    ]);
    const topsRequest = vi.spyOn(api, "mapTops");

    renderMapDetail();

    expect(
      await screen.findByRole("heading", {
        name: "No tops available for 125 FPS on mp_alpha",
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("radiogroup", { name: "Top runs FPS" })).getByRole("radio", {
        name: "125, no tops available",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("125 FPS difficulty").nextElementSibling).toHaveTextContent(
      "Not rated",
    );
    expect(
      screen.getByRole("img", { name: /Why not rated: No runs have been recorded/ }),
    ).toBeVisible();
    expect(topsRequest).not.toHaveBeenCalled();
  });

  it("renders explicit catalog-error and unavailable-map states", async () => {
    const mapsRequest = vi.spyOn(api, "maps").mockRejectedValue(new Error("Catalog unavailable"));
    const topsRequest = vi.spyOn(api, "mapTops");
    const firstView = renderMapDetail();

    expect(
      await screen.findByRole("heading", { name: "Map details could not be loaded" }),
    ).toBeVisible();
    expect(screen.getByText("Catalog unavailable")).toBeVisible();

    firstView.unmount();
    mapsRequest.mockResolvedValue([]);
    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "Map unavailable" })).toBeVisible();
    expect(topsRequest).not.toHaveBeenCalled();
  });

  it("links to the 3D view and to Jump4Life replays only when map models are configured", async () => {
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "https://models.example.test/maps/");
    vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    window.history.replaceState(null, "", "/maps/1?source=j4l&fps=333&cp=102");

    try {
      renderMapDetail();

      expect(await screen.findByRole("link", { name: "View in 3D" })).toHaveAttribute(
        "href",
        "/maps/1/3d?source=j4l",
      );
      expect(
        await screen.findByRole("link", { name: "Watch Alpha Runner's replay, rank 1" }),
      ).toHaveAttribute("href", "/replays/700");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const replayAggregate: ReplayWatchAggregate = {
  mapid: 1,
  replay_count: 1,
  watch_count: 12,
  unique_viewer_count: 8,
  total_watch_ms: 300_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

const replayRanking: ReplayWatchRankingEntry = {
  rank: 1,
  run_id: 700,
  fps: "125",
  mapid: 1,
  owner_player_id: 7,
  mapname: "mp_alpha",
  owner_playername: "Replay Runner",
  country: "Exampleland",
  watch_count: 12,
  unique_viewer_count: 8,
  total_watch_ms: 300_000,
  first_watched_at: "2026-07-01T10:00:00Z",
  last_watched_at: "2026-08-01T11:00:00Z",
  updated_at: "2026-08-01T11:05:00Z",
};

function topRun(overrides: Partial<TopRun>): TopRun {
  return {
    rank: 1,
    player_id: 1,
    playername: "Runner",
    time_played: 20_951,
    time_played_string: "20.951",
    fps: "125",
    score: 0,
    mapname: "mp_alpha",
    cpid: 101,
    load_count: 7,
    save_count: 2,
    time_created: "2026-08-15T00:00:00Z",
    ...overrides,
  };
}

function deferred<Value>() {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
