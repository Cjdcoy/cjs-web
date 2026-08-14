import { lazy } from "react";

export const AboutPage = lazy(async () => {
  const feature = await import("../features/about");
  return { default: feature.AboutPage };
});
export const FavoritesPage = lazy(async () => {
  const feature = await import("../features/favorites");
  return { default: feature.FavoritesPage };
});
export const LeaderboardsPage = lazy(async () => {
  const feature = await import("../features/leaderboards");
  return { default: feature.LeaderboardsPage };
});
export const MapsPage = lazy(async () => {
  const feature = await import("../features/maps");
  return { default: feature.MapsPage };
});
export const MapDetailPage = lazy(async () => {
  const feature = await import("../features/maps");
  return { default: feature.MapDetailPage };
});
export const PlayersPage = lazy(async () => {
  const feature = await import("../features/players");
  return { default: feature.PlayersPage };
});
export const PlayerDetailPage = lazy(async () => {
  const feature = await import("../features/players");
  return { default: feature.PlayerDetailPage };
});
export const ServersPage = lazy(async () => {
  const feature = await import("../features/servers");
  return { default: feature.ServersPage };
});
