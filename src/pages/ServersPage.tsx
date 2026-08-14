import { Grid2X2, List, MapPin, RefreshCw, Server as ServerIcon, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Choice, ErrorState, FilterGroup, Page, SkeletonRows, ToolbarButton } from "../components";
import { useAsync } from "../hooks";
import type { GameServer, Source } from "../types";
import { serverRegion } from "../utils";

type GameFilter = "all" | "COD2" | "COD4";
type Occupancy = "all" | "players";

export function ServersPage() {
  const [source] = useState<Source>("jh");
  const [game, setGame] = useState<GameFilter>("COD2");
  const [occupancy, setOccupancy] = useState<Occupancy>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [refreshIn, setRefreshIn] = useState(30);
  const { data, loading, error, reload } = useAsync((signal) => api.servers(source, signal), [source]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshIn((value) => {
        if (value <= 1) {
          reload();
          return 30;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const servers = useMemo(
    () =>
      (data?.servers || []).filter(
        (server) =>
          (game === "all" || server.game_type.toUpperCase() === game) &&
          (occupancy === "all" || server.player_count > 0),
      ),
    [data, game, occupancy],
  );

  return (
    <Page active="/" accent="amber">
      <div className="servers-toolbar filters-inline">
        <FilterGroup label="Show">
          <Choice value="all" current={game} onSelect={setGame}>All</Choice>
          <Choice value="COD2" current={game} onSelect={setGame}>COD2</Choice>
          <Choice value="COD4" current={game} onSelect={setGame}>COD4</Choice>
        </FilterGroup>
        <FilterGroup label="Filters">
          <Choice value="all" current={occupancy} onSelect={setOccupancy}>All</Choice>
          <Choice value="players" current={occupancy} onSelect={setOccupancy}>With Players</Choice>
        </FilterGroup>
        <div className="toolbar-spacer" />
        <FilterGroup label="Refresh Servers">
          <button className="refresh-pill" onClick={() => { reload(); setRefreshIn(30); }}>
            <RefreshCw size={15} /> {refreshIn} <span>Seconds</span>
          </button>
        </FilterGroup>
        <FilterGroup label="View">
          <ToolbarButton active={view === "grid"} label="Grid view" onClick={() => setView("grid")}>
            <Grid2X2 size={17} />
          </ToolbarButton>
          <ToolbarButton active={view === "list"} label="List view" onClick={() => setView("list")}>
            <List size={17} />
          </ToolbarButton>
        </FilterGroup>
      </div>

      {data && (
        <div className="summary-strip">
          <span><i className="live-dot" /> {data.online_servers} servers online</span>
          <span><Users size={16} /> {data.total_players} players connected</span>
          <span>{servers.length} matching your filters</span>
        </div>
      )}

      {loading && <SkeletonRows cards count={6} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (
        <section className={`server-grid ${view === "list" ? "list-view" : ""}`}>
          {servers.map((server) => <ServerCard server={server} key={`${server.ip}:${server.port}`} />)}
        </section>
      )}
    </Page>
  );
}

function ServerCard({ server }: { server: GameServer }) {
  const region = serverRegion(server.domain);
  return (
    <article className="server-card">
      <header>
        <span className="region-mark">{region.code}</span>
        <div>
          <h2>{region.name}</h2>
          <p>{server.domain}:{server.port}</p>
        </div>
        <span className="game-badge">{server.game_type}</span>
      </header>
      <div className="server-map">
        <span><MapPin size={15} /> Current map</span>
        <a href={server.mapid ? `/map?mapid=${server.mapid}&source=jh` : undefined}>{server.map}</a>
      </div>
      <div className="server-meta">
        <span><ServerIcon size={15} /> {server.ip}:{server.port}</span>
        <span><Users size={15} /> {server.player_count} player{server.player_count === 1 ? "" : "s"}</span>
      </div>
      <div className="player-slots">
        {server.players?.length ? server.players.map((player, index) => (
          <span key={`${player.playername}-${index}`}>
            <strong>{player.playername}</strong><small>{player.ping} ms</small>
          </span>
        )) : <p>No players connected</p>}
      </div>
    </article>
  );
}
