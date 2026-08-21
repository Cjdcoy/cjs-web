import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameMap, Player } from "../api";
import {
  FAVORITES_SCHEMA_VERSION,
  FAVORITES_STORAGE_KEY,
  LEGACY_FAVORITE_MAPS_KEY,
  LEGACY_FAVORITE_PLAYERS_KEY,
  createFavoriteStore,
  decodeFavoritesDocument,
  favoriteKey,
  selectMapFavorites,
  selectPlayerFavorites,
  useFavorites,
} from "./favorites";

const map: GameMap = {
  author: "Mapper",
  cp_id: 17,
  individual_finish_count: 12,
  mapid: 7,
  mapname: "mp_saved",
  released: "2026-01-01T00:00:00Z",
  type: "jump",
};

const player: Player = {
  country: "Testland",
  last_seen: "2026-01-02T00:00:00Z",
  player_id: 7,
  playername: "^2Runner^7One",
  visits: 24,
};

describe("favorite storage", () => {
  it("recovers from malformed and unsupported documents without throwing", () => {
    expect(decodeFavoritesDocument("{not-json")).toBeNull();
    expect(
      decodeFavoritesDocument(
        JSON.stringify({ version: FAVORITES_SCHEMA_VERSION + 1, entries: {} }),
      ),
    ).toBeNull();

    const storage = createStorage();
    storage.setItem(FAVORITES_STORAGE_KEY, "{not-json");
    const store = createFavoriteStore({
      getEventTarget: () => null,
      getStorage: () => storage,
    });

    expect(store.getSnapshot()).toEqual({ version: FAVORITES_SCHEMA_VERSION, entries: {} });
  });

  it("migrates valid legacy entries and keeps matching IDs source-qualified", () => {
    const storage = createStorage();
    storage.setItem(
      LEGACY_FAVORITE_MAPS_KEY,
      JSON.stringify([
        { mapid: 7, mapname: "Legacy JH", cp_id: 17 },
        { mapid: 7, mapname: "Legacy J4L", cp_id: 27, source: "j4l" },
        { mapid: "invalid", mapname: "Discard me" },
      ]),
    );
    storage.setItem(
      LEGACY_FAVORITE_PLAYERS_KEY,
      JSON.stringify([{ player_id: 9, playername: "Legacy player", source: "j4l" }]),
    );
    const store = createFavoriteStore({
      getEventTarget: () => null,
      getStorage: () => storage,
      now: () => "2026-08-15T00:00:00.000Z",
    });

    const document = store.getSnapshot();

    expect(selectMapFavorites(document).map((entry) => entry.key)).toEqual([
      favoriteKey("map", "j4l", 7),
      favoriteKey("map", "jh", 7),
    ]);
    expect(selectPlayerFavorites(document)).toHaveLength(1);
    expect(storage.getItem(FAVORITES_STORAGE_KEY)).toContain('"version":1');
  });

  it("adds, toggles, removes, and clears favorites by entity type", () => {
    const storage = createStorage();
    const store = createFavoriteStore({
      getEventTarget: () => new EventTarget(),
      getStorage: () => storage,
      now: () => "2026-08-15T00:00:00.000Z",
    });

    expect(store.addMap(map, "jh")).toBe(true);
    expect(store.addMap(map, "j4l")).toBe(true);
    expect(store.addPlayer(player, "jh")).toBe(true);
    expect(Object.keys(store.getSnapshot().entries)).toHaveLength(3);
    expect(store.toggleMap(map, "jh")).toBe(false);
    expect(store.getSnapshot().entries[favoriteKey("map", "j4l", 7)]).toBeDefined();
    expect(store.remove("map", "jh", 7)).toBe(false);
    expect(store.clear("map")).toBe(1);
    expect(selectPlayerFavorites(store.getSnapshot())).toHaveLength(1);
    expect(store.clear()).toBe(1);
    expect(store.getSnapshot().entries).toEqual({});
  });

  it("updates subscribers when another tab emits a storage event", () => {
    const storage = createStorage();
    const firstTab = new EventTarget();
    const secondTab = new EventTarget();
    const firstStore = createFavoriteStore({
      getEventTarget: () => firstTab,
      getStorage: () => storage,
    });
    const secondStore = createFavoriteStore({
      getEventTarget: () => secondTab,
      getStorage: () => storage,
    });
    const listener = vi.fn();
    const unsubscribe = secondStore.subscribe(listener);

    function FavoriteCount() {
      const document = useFavorites(secondStore);
      return <output aria-label="Favorite count">{Object.keys(document.entries).length}</output>;
    }

    render(<FavoriteCount />);
    expect(screen.getByLabelText("Favorite count")).toHaveTextContent("0");

    act(() => {
      firstStore.addMap(map, "jh");
      secondTab.dispatchEvent(new StorageEvent("storage", { key: FAVORITES_STORAGE_KEY }));
    });

    expect(listener).toHaveBeenCalled();
    expect(screen.getByLabelText("Favorite count")).toHaveTextContent("1");
    unsubscribe();
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
