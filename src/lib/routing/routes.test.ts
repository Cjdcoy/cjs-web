import { describe, expect, it } from "vitest";
import {
  getLegacyRedirect,
  mapDetailPath,
  matchRoute,
  playerDetailPath,
  routeDefinitions,
  type RouteLocation,
} from "./routes";

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

describe("route table", () => {
  it("publishes every application route", () => {
    expect(routeDefinitions.map(({ path }) => path)).toEqual([
      "/",
      "/leaderboards",
      "/maps",
      "/maps/:mapId",
      "/players",
      "/players/:playerId",
      "/favorites",
      "/about",
      "*",
    ]);
  });

  it.each([
    ["/", "servers"],
    ["/leaderboards", "leaderboards"],
    ["/maps", "maps"],
    ["/players/42", "player-detail"],
    ["/favorites/", "favorites"],
    ["/about", "about"],
  ] as const)("matches a direct load of %s", (pathname, routeId) => {
    expect(matchRoute(pathname).id).toBe(routeId);
  });

  it("decodes detail parameters", () => {
    expect(matchRoute("/maps/mp%5Fjump")).toEqual({
      id: "map-detail",
      params: { mapId: "mp_jump" },
    });
  });

  it("returns the not-found route for an unknown path", () => {
    expect(matchRoute("/not-a-real-page")).toEqual({ id: "not-found", params: {} });
  });
});

describe("detail route links", () => {
  it("encodes map and player identifiers and query values", () => {
    expect(mapDetailPath("mp jump", { source: "j4l" })).toBe("/maps/mp%20jump?source=j4l");
    expect(mapDetailPath(19, { source: "jh", lookup: "cpid" })).toBe(
      "/maps/19?source=jh&lookup=cpid",
    );
    expect(playerDetailPath("12/3", "jh")).toBe("/players/12%2F3?source=jh");
  });
});

describe("legacy route redirects", () => {
  it("replaces legacy map and player query routes", () => {
    expect(getLegacyRedirect(location("/map", "?mapid=73&source=j4l"))).toBe("/maps/73?source=j4l");
    expect(getLegacyRedirect(location("/player", "?playerid=91&source=jh", "#tops"))).toBe(
      "/players/91?source=jh#tops",
    );
  });

  it("keeps the legacy checkpoint lookup working", () => {
    expect(getLegacyRedirect(location("/map", "?source=jh&cpid=27"))).toBe(
      "/maps/27?source=jh&lookup=cpid",
    );
  });

  it("redirects incomplete legacy routes to their collection", () => {
    expect(getLegacyRedirect(location("/map", "?source=jh"))).toBe("/maps?source=jh");
    expect(getLegacyRedirect(location("/player"))).toBe("/players");
  });
});
