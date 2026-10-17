import type { ReactNode } from "react";
import type { AppRouteId, RouteMatch } from "../lib/routing";
import { NotFoundPage } from "./NotFoundPage";
import {
  AboutPage,
  FavoritesPage,
  LeaderboardsPage,
  MapDetailPage,
  MapsPage,
  MapViewerPage,
  PlayerDetailPage,
  PlayersPage,
  RecentPage,
  ReplayPage,
  ServersPage,
} from "./routeComponents";

type RouteRenderer = (match: RouteMatch) => ReactNode;

export const appRouteTable: Readonly<Record<AppRouteId, RouteRenderer>> = {
  about: () => <AboutPage />,
  favorites: () => <FavoritesPage />,
  leaderboards: () => <LeaderboardsPage />,
  "map-detail": ({ params }) => <MapDetailPage mapId={params.mapId} />,
  "map-viewer": ({ params }) => <MapViewerPage mapId={params.mapId} />,
  maps: () => <MapsPage />,
  "not-found": () => <NotFoundPage />,
  "player-detail": ({ params }) => <PlayerDetailPage playerId={params.playerId} />,
  players: () => <PlayersPage />,
  recent: () => <RecentPage />,
  replay: ({ params }) => <ReplayPage runId={params.runId} />,
  servers: () => <ServersPage />,
};

export function renderRoute(match: RouteMatch): ReactNode {
  return appRouteTable[match.id](match);
}
