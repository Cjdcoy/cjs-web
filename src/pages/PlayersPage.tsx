import { Grid2X2, Heart, List, Search, Shield, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { Choice, ErrorState, FilterGroup, Page, SkeletonRows, ToolbarButton } from "../components";
import { useAsync } from "../hooks";
import type { Player, Source } from "../types";
import { cleanName, favorites, formatNumber, timeAgo } from "../utils";

type Sort = "last" | "admin" | "visits";
type Color = "all" | "colored" | "plain";

export function PlayersPage() {
  const [source, setSource] = useState<Source>("jh");
  const [sort, setSort] = useState<Sort>("last");
  const [color, setColor] = useState<Color>("all");
  const [year, setYear] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [country, setCountry] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const [favoriteVersion, setFavoriteVersion] = useState(0);
  const { data, loading, error, reload } = useAsync((signal) => api.players(source, signal), [source]);

  const favoriteIds = useMemo(
    () => new Set(favorites.players().filter((player) => player.source === source).map((player) => player.player_id)),
    [favoriteVersion, source],
  );

  const players = useMemo(() => {
    const values = (data || []).filter((player) => {
      const display = player.pref_name || player.playername;
      const colored = /\^./.test(display);
      return (
        display.toLowerCase().includes(name.toLowerCase()) &&
        (!id || String(player.player_id).includes(id)) &&
        (player.country || "").toLowerCase().includes(country.toLowerCase()) &&
        (!year || player.last_seen?.startsWith(year)) &&
        (color === "all" || (color === "colored" ? colored : !colored))
      );
    });
    return values.sort((a, b) => {
      if (sort === "visits") return (b.visits || 0) - (a.visits || 0);
      if (sort === "admin") return (b.admin || 0) - (a.admin || 0);
      return String(b.last_seen || "").localeCompare(String(a.last_seen || ""));
    });
  }, [data, name, id, country, year, color, sort]);

  const stats = useMemo(() => ({
    total: data?.length || 0,
    helpers: data?.filter((player) => (player.admin || 0) > 0 && (player.admin || 0) < 90).length || 0,
    admins: data?.filter((player) => (player.admin || 0) >= 90).length || 0,
    donators: data?.filter((player) => (player.donated || 0) > 0).length || 0,
    active: data?.filter((player) => Date.now() - new Date((player.last_seen || "1970-01-01").replace(" ", "T") + "Z").getTime() < 864e5 * 30).length || 0,
    banned: data?.filter((player) => (player.banned || 0) > 0).length || 0,
  }), [data]);

  const toggleFavorite = (player: Player) => {
    favorites.togglePlayer(player, source);
    setFavoriteVersion((value) => value + 1);
  };

  return (
    <Page active="/players" accent="teal">
      <div className="filters-inline players-filter-row">
        <FilterGroup label="Server Type">
          <Choice value="jh" current={source} onSelect={setSource}>Jumpers Heaven</Choice>
          <Choice value="j4l" current={source} onSelect={setSource}>Jump 4 Life</Choice>
        </FilterGroup>
        <FilterGroup label="Sort By">
          <Choice value="last" current={sort} onSelect={setSort}>Last Seen</Choice>
          <Choice value="admin" current={sort} onSelect={setSort}>Admin Level</Choice>
          <Choice value="visits" current={sort} onSelect={setSort}>Visit Count</Choice>
        </FilterGroup>
        <FilterGroup label="Player Colors">
          <Choice value="all" current={color} onSelect={setColor}>All</Choice>
          <Choice value="colored" current={color} onSelect={setColor}>Colored</Choice>
          <Choice value="plain" current={color} onSelect={setColor}>Non-Colored</Choice>
        </FilterGroup>
      </div>

      <div className="secondary-filters">
        <label><span>Last Seen Year</span><input value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" /></label>
      </div>

      <div className="list-toolbar players-toolbar">
        <label className="input-field"><Search size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Player Name" /></label>
        <label className="input-field"><input value={id} onChange={(event) => setId(event.target.value.replace(/\D/g, ""))} placeholder="Player ID" /></label>
        <label className="input-field"><input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Search by player country..." /></label>
        <p>Showing <strong>{players.length}</strong> of {data?.length || 0} players</p>
        <div className="toolbar-actions"><ToolbarButton label="Grid view" active={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} /></ToolbarButton><ToolbarButton label="List view" active={view === "list"} onClick={() => setView("list")}><List size={16} /></ToolbarButton></div>
      </div>

      <section className="badge-filter-block">
        <h3>Filter By Badges</h3>
        <div className="badge-stats">
          <BadgeStat label="Total Players" value={stats.total} active />
          <BadgeStat label="Helpers" value={stats.helpers} />
          <BadgeStat label="Admins" value={stats.admins} />
          <BadgeStat label="Donators" value={stats.donators} />
          <BadgeStat label="Active Players" value={stats.active} />
          <BadgeStat label="Banned" value={stats.banned} />
        </div>
      </section>

      {loading && <SkeletonRows count={7} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (view === "list" ? (
        <div className="table-scroll"><table className="data-table players-table"><thead><tr><th>Player</th><th>Visits</th><th>Last Seen</th><th>Badges</th><th /></tr></thead><tbody>{players.slice(0, 300).map((player) => <PlayerRow key={player.player_id} player={player} source={source} favorite={favoriteIds.has(player.player_id)} toggle={() => toggleFavorite(player)} />)}</tbody></table></div>
      ) : (
        <div className="player-grid">{players.slice(0, 200).map((player) => <PlayerCard key={player.player_id} player={player} source={source} favorite={favoriteIds.has(player.player_id)} toggle={() => toggleFavorite(player)} />)}</div>
      ))}
    </Page>
  );
}

function BadgeStat({ label, value, active }: { label: string; value: number; active?: boolean }) {
  return <button className={active ? "active" : ""}><span>{label}</span><strong>{formatNumber(value)}</strong></button>;
}

function PlayerIdentity({ player }: { player: Player }) {
  return <div className="player-identity"><span className="avatar">{cleanName(player.pref_name || player.playername).slice(0, 1).toUpperCase()}</span><span><strong>{cleanName(player.pref_name || player.playername)}</strong><small>#{player.player_id} · {player.country || "--"}</small></span></div>;
}

function PlayerBadges({ player }: { player: Player }) {
  return <div className="player-badges">{(player.admin || 0) >= 90 && <span><Shield size={13} /> Admin</span>}{(player.donated || 0) > 0 && <span><Heart size={13} /> Donator</span>}{(player.banned || 0) > 0 && <span className="danger">Banned</span>}</div>;
}

function PlayerRow({ player, source, favorite, toggle }: { player: Player; source: Source; favorite: boolean; toggle: () => void }) {
  return <tr><td><a href={`/player?playerid=${player.player_id}&source=${source}`}><PlayerIdentity player={player} /></a></td><td>{formatNumber(player.visits)}</td><td>{timeAgo(player.last_seen)}</td><td><PlayerBadges player={player} /></td><td><button className={`favorite-button ${favorite ? "selected" : ""}`} onClick={toggle}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button></td></tr>;
}

function PlayerCard({ player, source, favorite, toggle }: { player: Player; source: Source; favorite: boolean; toggle: () => void }) {
  return <article className="player-card"><a href={`/player?playerid=${player.player_id}&source=${source}`}><PlayerIdentity player={player} /></a><button className={`favorite-button ${favorite ? "selected" : ""}`} onClick={toggle}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button><div className="player-card-stats"><span><Users size={14} /> {formatNumber(player.visits)} visits</span><span><UserRound size={14} /> {timeAgo(player.last_seen)}</span></div><PlayerBadges player={player} /></article>;
}
