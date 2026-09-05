import type { AppRouteId, RouteMatch } from "../lib/routing";

export interface RouteMetadata {
  title: string;
  description: string;
}

type RouteMetadataResolver = (match: RouteMatch) => RouteMetadata;

const routeMetadata: Readonly<Record<AppRouteId, RouteMetadataResolver>> = {
  about: () => ({
    title: "About the project | CJS",
    description:
      "Learn how CodJumper Stats uses public JumpersHeaven and Jump4Life data, what stays in your browser, and where the project is developed.",
  }),
  favorites: () => ({
    title: "Favorite maps and players | CJS",
    description:
      "Review the CodJumper maps and players saved locally as favorites in this browser.",
  }),
  leaderboards: () => ({
    title: "CodJumper leaderboards | CJS",
    description:
      "Compare supported JumpersHeaven and Jump4Life player rankings and leaderboard results.",
  }),
  "map-detail": (match) => ({
    title: `${routeParameter(match, "mapId", "Map")} map records | CJS`,
    description:
      "Explore available map metadata, completion difficulty, checkpoints, and top runs from the public CJ Stats API.",
  }),
  maps: () => ({
    title: "CodJumper maps | CJS",
    description:
      "Search and filter supported JumpersHeaven and Jump4Life maps, routes, difficulty, and record availability.",
  }),
  "not-found": () => ({
    title: "Page not found | CJS",
    description:
      "The requested CodJumper Stats page could not be found. Return to live servers or use the site navigation.",
  }),
  "player-detail": (match) => ({
    title: `Player ${routeParameter(match, "playerId", "profile")} | CJS`,
    description:
      "View the available identity, activity, performance, ranking, completion, and top-run data for this CodJumper player.",
  }),
  players: () => ({
    title: "Find CodJumper players | CJS",
    description:
      "Search supported JumpersHeaven and Jump4Life players and open source-aware player profiles.",
  }),
  recent: () => ({
    title: "Recent updates | CJS",
    description:
      "Follow a chronological feed of the latest JumpersHeaven and Jump4Life activity, with the map, route, time, and FPS of every finish.",
  }),
  servers: () => ({
    title: "Live CodJumper servers | CJS",
    description:
      "Browse live JumpersHeaven and Jump4Life server, map, occupancy, and player information.",
  }),
};

export function getRouteMetadata(match: RouteMatch): RouteMetadata {
  return routeMetadata[match.id](match);
}

export function applyRouteMetadata(match: RouteMatch, pathname: string): void {
  if (typeof document === "undefined") return;

  const metadata = getRouteMetadata(match);
  document.title = metadata.title;

  setMeta("name", "description", metadata.description);
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("name", "twitter:title", metadata.title);
  setMeta("name", "twitter:description", metadata.description);

  if (typeof window === "undefined") return;

  const pageUrl = new URL(pathname, window.location.origin).href;
  const socialImageUrl = new URL("/social-card.svg", window.location.origin).href;
  setMeta("property", "og:url", pageUrl);
  setMeta("property", "og:image", socialImageUrl);
  setMeta("name", "twitter:image", socialImageUrl);
  setCanonicalUrl(pageUrl);
}

function routeParameter(match: RouteMatch, name: string, fallback: string): string {
  return match.params[name]?.trim() || fallback;
}

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function setCanonicalUrl(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = href;
}
