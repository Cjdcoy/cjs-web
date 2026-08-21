import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameMap, Player } from "../../lib/api";
import {
  FAVORITES_STORAGE_KEY,
  favoriteStore,
  favoriteKey,
  type FavoritesDocumentV1,
} from "../../lib/storage";
import { FavoritesPage } from "./FavoritesPage";

const savedMap: GameMap = {
  author: "Mapper",
  cp_id: 91,
  individual_finish_count: 15,
  mapid: 41,
  mapname: "mp_favorite",
  type: "jump",
};

const savedPlayer: Player = {
  country: "Testland",
  player_id: 41,
  playername: "^2Runner^7One",
  visits: 30,
};

describe("FavoritesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    window.history.replaceState(null, "", "/favorites");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps matching IDs from different sources separate and exposes URL-backed tabs", async () => {
    favoriteStore.addMap(savedMap, "jh");
    favoriteStore.addMap({ ...savedMap, mapname: "mp_j4l_favorite" }, "j4l");
    favoriteStore.addPlayer(savedPlayer, "j4l");
    const user = userEvent.setup();

    render(<FavoritesPage />);

    expect(screen.getByRole("link", { name: "mp_favorite" })).toHaveAttribute(
      "href",
      "/maps/41?source=jh",
    );
    expect(screen.getByRole("link", { name: "mp_j4l_favorite" })).toHaveAttribute(
      "href",
      "/maps/41?source=j4l",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 favorite maps and 1 favorite player");

    const mapsTab = screen.getByRole("radio", { name: "Maps, 2 favorites" });
    mapsTab.focus();
    await user.keyboard("{ArrowRight}");

    await waitFor(() => expect(window.location.search).toBe("?tab=players"));
    expect(screen.getByRole("link", { name: "RunnerOne" })).toHaveAttribute(
      "href",
      "/players/41?source=j4l",
    );
    expect(screen.getByRole("link", { name: "RunnerOne" })).toHaveAttribute(
      "data-variant",
      "player",
    );
    expect(document.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(document.querySelector('[data-cod-color="7"]')).toHaveTextContent("One");
  });

  it("keeps unavailable snapshots removable and clears the active group", async () => {
    const key = favoriteKey("map", "jh", 88);
    const document: FavoritesDocumentV1 = {
      version: 1,
      entries: {
        [key]: {
          entityType: "map",
          id: 88,
          key,
          savedAt: null,
          snapshot: null,
          source: "jh",
        },
      },
    };
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(document));
    fireEvent(window, new StorageEvent("storage", { key: FAVORITES_STORAGE_KEY }));
    const user = userEvent.setup();

    render(<FavoritesPage />);

    expect(screen.getByText("Details unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Map #88" })).toHaveAttribute(
      "href",
      "/maps/88?source=jh",
    );
    await user.click(screen.getByRole("button", { name: "Clear maps" }));

    expect(screen.getByRole("heading", { name: "No favorite maps yet" })).toBeInTheDocument();
    expect(screen.getByText("1 favorite map removed.")).toBeInTheDocument();
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toContain('"entries":{}');
    await waitFor(() => expect(screen.getByRole("link", { name: "Browse maps" })).toHaveFocus());
  });

  it("moves focus through remaining cards and then to the empty-state action", async () => {
    favoriteStore.addMap(savedMap, "jh");
    favoriteStore.addMap({ ...savedMap, mapid: 42, mapname: "mp_second" }, "jh");
    const user = userEvent.setup();
    render(<FavoritesPage />);

    await user.click(screen.getByRole("button", { name: "Remove mp_favorite from favorites" }));
    expect(screen.getByText("mp_favorite removed from favorites.")).toBeInTheDocument();
    const remainingRemove = screen.getByRole("button", {
      name: "Remove mp_second from favorites",
    });
    await waitFor(() => expect(remainingRemove).toHaveFocus());

    await user.click(remainingRemove);
    expect(screen.getByText("mp_second removed from favorites.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "Browse maps" })).toHaveFocus());
  });

  it("has no automated accessibility violations with saved entries", async () => {
    favoriteStore.addMap(savedMap, "jh");
    const { container } = render(<FavoritesPage />);

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
