import {
  Activity,
  BarChart3,
  Heart,
  Info,
  Map,
  Server,
  Users,
  type LucideIcon,
} from "lucide-react";
import { appPaths, type AppRouteId } from "../../lib/routing";

export interface PrimaryNavigationItem {
  activeRoutes: readonly AppRouteId[];
  href: string;
  icon: LucideIcon;
  label: string;
}

export const primaryNavigation: readonly PrimaryNavigationItem[] = [
  { activeRoutes: ["servers"], href: appPaths.servers, icon: Server, label: "Servers" },
  { activeRoutes: ["recent"], href: appPaths.recent, icon: Activity, label: "Recent" },
  {
    activeRoutes: ["leaderboards"],
    href: appPaths.leaderboards,
    icon: BarChart3,
    label: "Leaderboards",
  },
  {
    activeRoutes: ["maps", "map-detail"],
    href: appPaths.maps,
    icon: Map,
    label: "Maps",
  },
  {
    activeRoutes: ["players", "player-detail"],
    href: appPaths.players,
    icon: Users,
    label: "Players",
  },
  {
    activeRoutes: ["favorites"],
    href: appPaths.favorites,
    icon: Heart,
    label: "Favorites",
  },
  { activeRoutes: ["about"], href: appPaths.about, icon: Info, label: "About" },
];
