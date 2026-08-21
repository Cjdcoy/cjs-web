import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../app/AppRouter";
import { api, type GameMap, type TopRun } from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { MapDetailPage } from "./MapDetailPage";

const alphaCheckpoints: GameMap[] = [
  {
    mapid: 1,
    mapname: "mp_alpha",
    cp_id: 101,
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
    localStorage.clear();
    window.history.replaceState(null, "", "/maps/1");
  });

  it("loads a source-stable checkpoint and FPS deep link with player and media links", async () => {
    const mapsRequest = vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    window.history.replaceState(null, "", "/maps/1?source=j4l&fps=333&cp=102");

    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "mp_alpha", level: 1 })).toBeVisible();
    expect(mapsRequest).toHaveBeenCalledWith({
      source: "j4l",
      signal: expect.any(AbortSignal),
    });
    expect(topsRequest).toHaveBeenCalledWith({
      source: "j4l",
      checkpointId: 102,
      fps: "333",
      limit: 100,
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole("combobox", { name: "Checkpoint" })).toHaveValue("102");
    expect(screen.getByRole("combobox", { name: "FPS" })).toHaveValue("333");
    expect(screen.getByText("Map author not available")).toBeVisible();
    expect(screen.getByText("Release date unavailable")).toBeVisible();
    expect(await screen.findByRole("link", { name: "Alpha Runner" })).toHaveAttribute(
      "href",
      "/players/7?source=j4l",
    );
    expect(screen.getByRole("link", { name: /Watch map video/ })).toHaveAttribute(
      "href",
      "https://media.example.invalid/maps/mp_alpha",
    );
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
    expect(screen.getByRole("combobox", { name: "FPS" })).toHaveValue("333");
  });

  it("updates the checkpoint selection in the URL and requests only the new run list", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(alphaCheckpoints);
    const topsRequest = vi.spyOn(api, "mapTops").mockResolvedValue([alphaRun]);
    const user = userEvent.setup();

    renderMapDetail();
    await screen.findByRole("heading", { name: "mp_alpha", level: 1 });
    await user.selectOptions(screen.getByRole("combobox", { name: "Checkpoint" }), "102");

    await waitFor(() => {
      expect(window.location.search).toContain("cp=102");
      expect(topsRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ checkpointId: 102, fps: "125" }),
      );
    });
    expect(api.maps).toHaveBeenCalledTimes(1);
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
    await user.selectOptions(screen.getByRole("combobox", { name: "FPS" }), "333");

    expect(await screen.findByRole("link", { name: "Fresh Runner" })).toBeVisible();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => firstRuns.resolve([staleRun]));

    expect(screen.queryByRole("link", { name: "Stale Runner" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fresh Runner" })).toBeVisible();
    expect(window.location.search).toContain("fps=333");
  });

  it("keeps map metadata usable when the top-runs request fails", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([alphaCheckpoints[0]]);
    vi.spyOn(api, "mapTops").mockRejectedValue(new Error("Runs unavailable"));

    renderMapDetail();

    expect(await screen.findByRole("heading", { name: "mp_alpha", level: 1 })).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Top runs could not be loaded" }),
    ).toBeVisible();
    expect(screen.getByText("Runs unavailable")).toBeVisible();
    expect(screen.getByText("30")).toBeVisible();
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
});

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
