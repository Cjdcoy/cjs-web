import { render, screen, waitFor, within } from "@testing-library/react";
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
    author: "Second Mapper",
    released: "2026-01-01T00:00:00Z",
    type: "surf",
    difficulty: { "333": { difficulty: 7, nb_tops: 5 } },
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

describe("MapsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

    renderMapsPage();

    const results = await screen.findByRole("region", { name: "Map results" });
    expect(mapsRequest).toHaveBeenCalledWith({ source: "j4l", signal: expect.any(AbortSignal) });
    expect(results).toHaveAttribute("data-view", "grid");
    expect(within(results).getByRole("link", { name: "mp_beta" })).toHaveAttribute(
      "href",
      "/maps/2?source=j4l",
    );
    expect(within(results).queryByRole("link", { name: "mp_alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Map result count" })).toHaveTextContent(
      "1 matching maps",
    );

    const favoriteButton = within(results).getByRole("button", {
      name: "Add mp_beta to favorites",
    });
    await user.click(favoriteButton);

    expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("mp_beta added to favorites.")).toBeInTheDocument();
  });

  it("updates filters in the URL and announces deterministic result counts", async () => {
    vi.spyOn(api, "maps").mockResolvedValue(response);
    const user = userEvent.setup();
    renderMapsPage();

    await screen.findByRole("link", { name: "mp_alpha" });
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
