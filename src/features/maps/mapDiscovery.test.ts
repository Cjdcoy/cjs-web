import { describe, expect, it } from "vitest";
import type { GameMap } from "../../lib/api";
import { readQueryState, updateQuerySearch } from "../../lib/routing";
import {
  filterAndSortMaps,
  getAvailableRouteTypes,
  getMapDifficulty,
  mapDiscoveryQuerySchema,
  prepareMaps,
  type MapDiscoveryFilters,
} from "./mapDiscovery";

const maps: GameMap[] = [
  {
    mapid: 2,
    mapname: "mp_beta_10",
    cp_id: 202,
    author: "Mapper Two",
    released: "2026-02-01T00:00:00Z",
    type: "Surf",
    difficulty: { "125": { difficulty: 8, nb_tops: 2 } },
    individual_finish_count: 5,
    video: "https://example.invalid/video",
  },
  {
    mapid: 1,
    mapname: "mp_alpha",
    cp_id: 201,
    author: "Mapper One",
    released: "2025-02-01T00:00:00Z",
    type: "Jump",
    difficulty: { "125": { difficulty: 3, nb_tops: 12 } },
    individual_finish_count: 20,
    video: null,
  },
  {
    mapid: 3,
    mapname: "mp_beta_2",
    cp_id: 203,
    author: null,
    released: null,
    type: null,
    difficulty: null,
  },
];

const defaultFilters: MapDiscoveryFilters = {
  q: "",
  route: "all",
  media: "all",
  fps: "125",
  difficulty: "all",
  sort: "completions",
};

describe("map discovery state", () => {
  it("normalizes invalid URL values without discarding unrelated parameters", () => {
    const state = readQueryState(
      "?source=j4l&q=%20beta%20&fps=999&media=maybe&page=-4&view=grid",
      mapDiscoveryQuerySchema,
    );

    expect(state).toMatchObject({
      q: "beta",
      fps: "125",
      media: "all",
      page: 1,
      view: "grid",
    });

    expect(updateQuerySearch("?source=j4l&media=maybe", mapDiscoveryQuerySchema, state)).toBe(
      "?source=j4l&q=beta&view=grid",
    );
  });

  it("combines search, route, media, FPS rating, and sort filters deterministically", () => {
    const prepared = prepareMaps(maps);
    const result = filterAndSortMaps(prepared, {
      ...defaultFilters,
      q: "mapper",
      route: "surf",
      media: "with-media",
      difficulty: "rated",
      sort: "difficulty",
    });

    expect(result.map((item) => item.map.mapid)).toEqual([2]);
    expect(getAvailableRouteTypes(prepared)).toEqual(["jump", "surf"]);
  });

  it("sorts naturally with stable IDs and puts missing metadata last", () => {
    const prepared = prepareMaps(maps);

    expect(
      filterAndSortMaps(prepared, { ...defaultFilters, q: "beta", sort: "name" }).map(
        (item) => item.map.mapid,
      ),
    ).toEqual([3, 2]);
    expect(
      filterAndSortMaps(prepared, { ...defaultFilters, sort: "released" }).map(
        (item) => item.map.mapid,
      ),
    ).toEqual([2, 1, 3]);
    expect(
      filterAndSortMaps(prepared, { ...defaultFilters, sort: "difficulty" }).map(
        (item) => item.map.mapid,
      ),
    ).toEqual([2, 1, 3]);
  });

  it("treats absent or non-finite FPS ratings as unrated", () => {
    expect(getMapDifficulty(maps[0], "333")).toBeNull();
    expect(
      getMapDifficulty(
        {
          ...maps[0],
          difficulty: { "125": { difficulty: Number.NaN, nb_tops: 0 } },
        },
        "125",
      ),
    ).toBeNull();
  });
});
