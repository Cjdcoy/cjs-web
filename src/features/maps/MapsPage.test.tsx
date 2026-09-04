import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type GameMap } from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { MapsPage } from "./MapsPage";

const response: GameMap[] = [
  {
    mapid: 1,
    mapname: "mp_alpha",
    cp_id: 101,
    author: "First Mapper",
    released: "2025-01-01T00:00:00Z",
    type: "jump",
    difficulty: { "125": { difficulty: 2, nb_tops: 15 } },
    individual_finish_count: 30,
    video: null,
  },
  {
    mapid: 2,
    mapname: "mp_beta",
    cp_id: 102,
    ender: "125(hard)",
    author: "Second Mapper",
    released: "2026-01-01T00:00:00Z",
    type: "surf",
    difficulty: {
      "43": { difficulty: 1.25, nb_tops: 2 },
      "125": { difficulty: 4.5, nb_tops: 4 },
      "333": { difficulty: 7, nb_tops: 5 },
    },
    individual_finish_count: 10,
    video: "https://example.invalid/mp_beta",
  },
];

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

function renderMapsPage() {
  return render(
    <SourceProvider>
      <MapsPage />
    </SourceProvider>,
  );
}

function createMapResponse(count: number): GameMap[] {
  return Array.from({ length: count }, (_, index) => ({
    ...response[0],
    mapid: index + 1,
    cp_id: index + 101,
    mapname: `map_${String(index + 1).padStart(3, "0")}`,
    individual_finish_count: count - index,
  }));
}

describe("MapsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", localStorageMock);
    localStorage.clear();
    window.history.replaceState(null, "", "/maps");
  });

  it("loads a representative deep link and exposes stable map actions", async () => {
    const mapsRequest = vi.spyOn(api, "maps").mockResolvedValue(response);
    window.history.replaceState(
      null,
      "",
      "/maps?source=j4l&q=beta&view=grid&fps=333&media=with-media",
    );
    const user = userEvent.setup();

    const { container } = renderMapsPage();

    const pageHeading = screen.getByRole("heading", { level: 1, name: "Browse maps" });
    expect(pageHeading).toBeVisible();
    expect(pageHeading.closest(".cjs-page-heading")).not.toBeNull();
    expect(
      screen.getByText(
        "Search by map or author, compare route types and FPS difficulty, and open a map to view its records.",
      ),
    ).toBeVisible();
    const results = await screen.findByRole("region", { name: "Map results" });
    expect(mapsRequest).toHaveBeenCalledWith({ source: "j4l", signal: expect.any(AbortSignal) });
    expect(results).toHaveAttribute("data-view", "grid");
    expect(within(results).getByRole("link", { name: "mp_beta" })).toHaveAttribute(
      "href",
      "/maps/2?source=j4l",
    );
    expect(within(results).queryByRole("link", { name: "mp_alpha" })).not.toBeInTheDocument();
    expect(within(results).getByText("(125(hard))")).toBeVisible();
    const externalVideoLink = within(results).getByRole("link", {
      name: "Watch YouTube video for mp_beta (opens in a new tab)",
    });
    expect(externalVideoLink).toHaveAttribute("href", "https://example.invalid/mp_beta");
    expect(
      externalVideoLink.querySelector(".cjs-map-card__youtube-mark .lucide-play"),
    ).toBeInTheDocument();
    expect(within(results).queryByText("surf")).not.toBeInTheDocument();
    const mapImage = container.querySelector<HTMLImageElement>(
      '.cjs-map-card__image[src="/maps/cards/mp_beta.avif"]',
    );
    if (mapImage === null) throw new Error("Expected the map card image to render.");
    expect(mapImage).toBeInTheDocument();
    expect(mapImage).toHaveAttribute("loading", "eager");
    expect(mapImage).toHaveAttribute("fetchpriority", "high");
    expect(mapImage).toHaveAttribute("decoding", "async");
    expect(mapImage).toHaveAttribute(
      "srcset",
      "/maps/thumbs/mp_beta.avif 480w, /maps/cards/mp_beta.avif 960w",
    );
    expect(mapImage).toHaveAttribute("sizes", "(max-width: 48rem) 100vw, 18rem");
    const difficultyRatings = within(results).getByRole("list", {
      name: "Difficulty ratings by FPS",
    });
    expect(
      within(difficultyRatings).getByRole("listitem", {
        name: "43 FPS difficulty 1.25 out of 10",
      }),
    ).toBeVisible();
    expect(
      within(difficultyRatings).getByRole("listitem", {
        name: "333 FPS difficulty 7.00 out of 10",
      }),
    ).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "1 matching maps",
    );

    const favoriteButton = within(results).getByRole("button", {
      name: "Add mp_beta to favorites",
    });
    await user.click(favoriteButton);

    expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("mp_beta added to favorites.")).toBeInTheDocument();

    fireEvent.error(mapImage);
    expect(container.querySelector(".cjs-map-card__image")).not.toBeInTheDocument();
    expect(within(results).getByText("MP")).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to newest card results and keeps unknown release dates last", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([
      { ...response[0], mapid: 1, mapname: "unknown_release", released: null },
      { ...response[0], mapid: 2, mapname: "older_release", released: "2024-01-01" },
      { ...response[0], mapid: 3, mapname: "newest_release", released: "2026-01-01" },
    ]);
    const user = userEvent.setup();
    const { container } = renderMapsPage();

    await screen.findByRole("link", { name: "unknown_release" });
    const sortControl = screen.getByRole("combobox", { name: "Sort maps" });
    const results = screen.getByRole("region", { name: "Map results" });
    expect(sortControl).toHaveValue("released");
    expect(results).toHaveAttribute("data-view", "grid");
    expect(screen.queryByRole("combobox", { name: "Difficulty status" })).not.toBeInTheDocument();

    const readNames = () =>
      [...container.querySelectorAll(".cjs-map-card__heading .cjs-link")].map(
        (link) => link.textContent,
      );
    expect(readNames()).toEqual(["newest_release", "older_release", "unknown_release"]);

    await user.selectOptions(sortControl, "name");
    await user.click(screen.getByRole("radio", { name: "List view" }));
    await user.click(screen.getByRole("button", { name: "Reset filters" }));

    await waitFor(() => {
      expect(sortControl).toHaveValue("released");
      expect(results).toHaveAttribute("data-view", "grid");
      expect(readNames()).toEqual(["newest_release", "older_release", "unknown_release"]);
    });
  });

  it("identifies separate routes that share a map name", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([
      {
        ...response[0],
        mapid: 12,
        mapname: "mp_12",
        cp_id: 1201,
        ender: "125(hard)",
      },
      {
        ...response[0],
        mapid: 12,
        mapname: "mp_12",
        cp_id: 1202,
        ender: "250(easy)",
      },
    ]);
    renderMapsPage();

    expect(await screen.findByText("(125(hard))")).toBeVisible();
    expect(screen.getByText("(250(easy))")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "mp_12" })).toHaveLength(2);
  });

  it("links catalog-backed map videos through the source-stable map profile", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([
      { ...response[0], mapname: "mp_chilli", video: null },
    ]);
    window.history.replaceState(null, "", "/maps?source=j4l&media=with-media");

    renderMapsPage();

    const catalogVideoLink = await screen.findByRole("link", {
      name: "View 2 videos for mp_chilli",
    });
    expect(catalogVideoLink).toHaveAttribute("href", "/maps/1?source=j4l#map-videos");
    expect(
      catalogVideoLink.querySelector(".cjs-map-card__youtube-mark .lucide-play"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "1 matching maps",
    );
  });

  it("updates filters in the URL and announces deterministic result counts", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(response);
    const user = userEvent.setup();
    renderMapsPage();

    await screen.findByRole("link", { name: "mp_alpha" });
    expect(
      within(screen.getByRole("region", { name: "Map results" })).queryByText("No video listed"),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Media" }), "with-media");

    await waitFor(() => {
      expect(window.location.search).toContain("media=with-media");
      expect(screen.queryByRole("link", { name: "mp_alpha" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "mp_beta" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "1 matching maps",
    );

    const search = screen.getByRole("textbox", { name: "Search maps" });
    await user.type(search, "missing");

    expect(
      await screen.findByRole("heading", { name: "No maps match these filters" }),
    ).toBeVisible();
    expect(window.location.search).toContain("q=missing");
  });

  it("loads the next map batch automatically without numbered pagination", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(createMapResponse(30));
    const user = userEvent.setup();
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const unobserve = vi.fn();

    class IntersectionObserverMock implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "640px 0px";
      readonly thresholds = [0.01];

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = observe;
      unobserve = unobserve;
      disconnect = vi.fn();
      takeRecords = () => [];
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    const { container } = renderMapsPage();

    await screen.findByRole("link", { name: "map_001" });
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(24);
    expect(screen.queryByRole("navigation", { name: "Map results pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more maps" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "Showing 1–24 of 30 matching maps",
    );
    const cardImages = container.querySelectorAll(".cjs-map-card__image");
    expect(cardImages[0]).toHaveAttribute("loading", "eager");
    expect(cardImages[4]).toHaveAttribute("loading", "lazy");

    if (intersectionCallback === undefined) {
      throw new Error("Expected the infinite-scroll observer to be registered.");
    }
    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(30));
    expect(unobserve).toHaveBeenCalledOnce();
    expect(window.location.search).toContain("page=2");
    expect(screen.queryByRole("button", { name: "Load more maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "Showing 1–30 of 30 matching maps",
    );

    await user.type(screen.getByRole("textbox", { name: "Search maps" }), "map_001");
    await waitFor(() => {
      expect(window.location.search).not.toContain("page=2");
      expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(1);
    });
  });

  it("restores cumulative map depth from a shared URL", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(createMapResponse(30));
    window.history.replaceState(null, "", "/maps?page=2");
    const { container } = renderMapsPage();

    await screen.findByRole("link", { name: "map_030" });
    expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(30);
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "Showing 1–30 of 30 matching maps",
    );
  });

  it("offers a load-more fallback when automatic observation is unavailable", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(createMapResponse(30));
    const user = userEvent.setup();
    const { container } = renderMapsPage();

    await screen.findByRole("link", { name: "map_001" });
    expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(24);

    await user.click(screen.getByRole("button", { name: "Load more maps" }));

    await waitFor(() => expect(container.querySelectorAll(".cjs-map-card")).toHaveLength(30));
    expect(window.location.search).toContain("page=2");
  });

  it("renders explicit error and empty states", async () => {
    const mapsRequest = vi.spyOn(api, "maps").mockRejectedValue(new Error("Unavailable"));
    const { unmount } = renderMapsPage();

    expect(await screen.findByRole("heading", { name: "Maps could not be loaded" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry maps request" })).toBeEnabled();

    unmount();
    mapsRequest.mockResolvedValue([]);
    renderMapsPage();

    expect(await screen.findByRole("heading", { name: "No maps are available" })).toBeVisible();
  });
});
