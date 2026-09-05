export const routeDefinitions = [
  { id: "servers", path: "/" },
  { id: "leaderboards", path: "/leaderboards" },
  { id: "recent", path: "/recent" },
  { id: "maps", path: "/maps" },
  { id: "map-detail", path: "/maps/:mapId" },
  { id: "players", path: "/players" },
  { id: "player-detail", path: "/players/:playerId" },
  { id: "favorites", path: "/favorites" },
  { id: "about", path: "/about" },
  { id: "not-found", path: "*" },
] as const;

export type AppRouteId = (typeof routeDefinitions)[number]["id"];

export interface RouteLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface RouteMatch {
  id: AppRouteId;
  params: Readonly<Record<string, string>>;
}

interface CompiledRoute {
  id: Exclude<AppRouteId, "not-found">;
  parameterNames: string[];
  pattern: RegExp;
}

const compiledRoutes: CompiledRoute[] = routeDefinitions
  .filter((route) => route.path !== "*")
  .map((route) => {
    const parameterNames: string[] = [];
    const segments = route.path.split("/").filter(Boolean);
    const pattern = segments
      .map((segment) => {
        if (segment.startsWith(":")) {
          parameterNames.push(segment.slice(1));
          return "([^/]+)";
        }

        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");

    return {
      id: route.id,
      parameterNames,
      pattern: new RegExp(pattern ? `^/${pattern}/?$` : "^/?$"),
    };
  });

export const appPaths = {
  about: "/about",
  favorites: "/favorites",
  leaderboards: "/leaderboards",
  maps: "/maps",
  players: "/players",
  recent: "/recent",
  servers: "/",
} as const;

export function matchRoute(pathname: string): RouteMatch {
  for (const route of compiledRoutes) {
    const result = route.pattern.exec(pathname);
    if (!result) continue;

    const params = Object.fromEntries(
      route.parameterNames.map((name, index) => [name, decodeRouteParameter(result[index + 1])]),
    );

    return { id: route.id, params };
  }

  return { id: "not-found", params: {} };
}

export function mapDetailPath(
  mapId: number | string,
  options: { lookup?: "cpid"; source?: string } = {},
): string {
  return buildDetailPath(appPaths.maps, mapId, options);
}

export function playerDetailPath(playerId: number | string, source?: string): string {
  return buildDetailPath(appPaths.players, playerId, { source });
}

export function getLegacyRedirect(location: RouteLocation): string | null {
  if (location.pathname !== "/map" && location.pathname !== "/player") return null;

  const search = new URLSearchParams(location.search);
  const isMap = location.pathname === "/map";
  const idParameter = isMap ? (search.has("mapid") ? "mapid" : "cpid") : "playerid";
  const id = search.get(idParameter)?.trim();
  search.delete("mapid");
  search.delete("cpid");
  search.delete("playerid");

  if (!id) {
    return appendLocation(isMap ? appPaths.maps : appPaths.players, search, location.hash);
  }

  if (isMap && idParameter === "cpid") search.set("lookup", "cpid");
  const basePath = isMap ? appPaths.maps : appPaths.players;
  const path = `${basePath}/${encodeURIComponent(id)}`;
  return appendLocation(path, search, location.hash);
}

function buildDetailPath(
  basePath: string,
  id: number | string,
  query: { lookup?: "cpid"; source?: string },
): string {
  const search = new URLSearchParams();
  if (query.source) search.set("source", query.source);
  if (query.lookup) search.set("lookup", query.lookup);
  return appendLocation(`${basePath}/${encodeURIComponent(String(id))}`, search, "");
}

function appendLocation(pathname: string, search: URLSearchParams, hash: string): string {
  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function decodeRouteParameter(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
