import type { ReactNode } from "react";
import type { AppRouteId, RouteMatch } from "../lib/routing";
import { NotFoundPage } from "./NotFoundPage";
import {
  AboutPage,
  FavoritesPage,
  LeaderboardsPage,
  MapDetailPage,
  MapsPage,
  PlayerDetailPage,
  PlayersPage,
  RecentPage,
  ServersPage,
} from "./routeComponents";

type RouteRenderer = (match: RouteMatch) => ReactNode;

export const appRouteTable: Readonly<Record<AppRouteId, RouteRenderer>> = {
  about: () => <AboutPage />,
  favorites: () => <FavoritesPage />,
  leaderboards: () => <LeaderboardsPage />,
  "map-detail": ({ params }) => <MapDetailPage mapId={params.mapId} />,
  maps: () => <MapsPage />,
  "not-found": () => <NotFoundPage />,
  "player-detail": ({ params }) => <PlayerDetailPage playerId={params.playerId} />,
  players: () => <PlayersPage />,
  recent: () => <RecentPage />,
  servers: () => <ServersPage />,
};

export function renderRoute(match: RouteMatch): ReactNode {
  return appRouteTable[match.id](match);
}
