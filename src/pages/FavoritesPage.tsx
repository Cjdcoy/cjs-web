import { Heart, Map as MapIcon, Users } from "lucide-react";
import { useState } from "react";
import { EmptyState, Page } from "../components";
import type { GameMap, Player, Source } from "../types";
import { cleanName, favorites, formatNumber, timeAgo } from "../utils";
import { MapCard } from "./MapsPage";

export function FavoritesPage() {
  const [tab, setTab] = useState<"maps" | "players">("maps");
  const [version, setVersion] = useState(0);
  const maps = favorites.maps();
  const players = favorites.players();
  void version;

  const removeMap = (map: GameMap & { source?: string }) => {
    favorites.toggleMap(map, (map.source || "jh") as Source);
    setVersion((value) => value + 1);
  };
  const removePlayer = (player: Player & { source?: string }) => {
    favorites.togglePlayer(player, (player.source || "jh") as Source);
    setVersion((value) => value + 1);
  };

  return (
    <Page active="/favorites" accent="amber" footer={false}>
      <div className="favorites-tabs">
        <button className={tab === "maps" ? "active" : ""} onClick={() => setTab("maps")}><MapIcon size={16} /> Maps <span>{maps.length}</span></button>
        <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}><Users size={16} /> Players <span>{players.length}</span></button>
      </div>
      {tab === "maps" && (maps.length ? <div className="maps-results">{maps.map((map) => <MapCard key={`${map.source}-${map.mapid}`} map={map} source={(map.source || "jh") as Source} favorite toggleFavorite={() => removeMap(map)} />)}</div> : <EmptyState icon={MapIcon} title="No favorite maps yet" description="Use the heart button on a map to keep it close at hand." />)}
      {tab === "players" && (players.length ? <div className="favorite-player-list">{players.map((player) => <article key={`${player.source}-${player.player_id}`}><a href={`/player?playerid=${player.player_id}&source=${player.source || "jh"}`}><span className="avatar">{cleanName(player.pref_name || player.playername).slice(0, 1)}</span><span><strong>{cleanName(player.pref_name || player.playername)}</strong><small>{player.country || "--"} · {timeAgo(player.last_seen)} · {formatNumber(player.visits)} visits</small></span></a><button className="favorite-button selected" onClick={() => removePlayer(player)}><Heart fill="currentColor" size={18} /></button></article>)}</div> : <EmptyState icon={Users} title="No favorite players yet" description="Use the heart button on a player to add them here." />)}
    </Page>
  );
}
