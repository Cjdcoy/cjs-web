import { AboutPage } from "./pages/AboutPage";
import { MapDetailPage, PlayerDetailPage } from "./pages/DetailPages";
import { FavoritesPage } from "./pages/FavoritesPage";
import { LeaderboardsPage } from "./pages/LeaderboardsPage";
import { MapsPage } from "./pages/MapsPage";
import { PlayersPage } from "./pages/PlayersPage";
import { ServersPage } from "./pages/ServersPage";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/leaderboards") return <LeaderboardsPage />;
  if (path === "/maps") return <MapsPage />;
  if (path === "/map") return <MapDetailPage />;
  if (path === "/players") return <PlayersPage />;
  if (path === "/player") return <PlayerDetailPage />;
  if (path === "/about") return <AboutPage />;
  if (path === "/favorites") return <FavoritesPage />;
  return <ServersPage />;
}
