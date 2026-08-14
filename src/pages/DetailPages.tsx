import { ArrowLeft, CalendarDays, Gauge, Heart, Map as MapIcon, Trophy, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { Choice, ErrorState, Page, SkeletonRows, Stat } from "../components";
import { useAsync } from "../hooks";
import type { GameMap, Player, Source, TopRun } from "../types";
import { cleanName, difficultyLabel, favorites, formatDate, formatNumber, getDifficulty, timeAgo } from "../utils";

function query() { return new URLSearchParams(window.location.search); }

export function MapDetailPage() {
  const source = (query().get("source") === "j4l" ? "j4l" : "jh") as Source;
  const mapid = Number(query().get("mapid"));
  const cpid = Number(query().get("cpid"));
  const [fps, setFps] = useState("125");
  const [favoriteVersion, setFavoriteVersion] = useState(0);
  const { data, loading, error, reload } = useAsync(async (signal) => {
    const maps = await api.maps(source, signal);
    const map = maps.find((entry) => (mapid ? entry.mapid === mapid : entry.cp_id === cpid)) || null;
    if (!map) return { map: null, tops: [] as TopRun[] };
    const tops = await api.mapTops(source, map.cp_id, fps, signal);
    return { map, tops };
  }, [source, mapid, cpid, fps]);
  const map = data?.map;
  const isFavorite = Boolean(map && favorites.maps().some((entry) => entry.mapid === map.mapid && entry.source === source));
  void favoriteVersion;

  return (
    <Page active="/maps" accent="blue">
      <a className="back-link" href="/maps"><ArrowLeft size={16} /> Back to maps</a>
      {loading && <SkeletonRows count={6} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !map && <ErrorState message="This map was not found in the selected data source." />}
      {map && <>
        <section className="detail-hero map-detail-hero">
          <div className="detail-art"><MapIcon size={56} /><span>{map.mapname.slice(0, 2).toUpperCase()}</span></div>
          <div className="detail-title"><p>{map.type || "Jump"} map</p><h1>{map.mapname}</h1><span>Created by <strong>{map.author || "Unknown"}</strong></span><div className="tag-row"><span>COD2</span><span>{difficultyLabel(getDifficulty(map))}</span><span>CP {map.cp_id}</span></div></div>
          <button className={`favorite-button large ${isFavorite ? "selected" : ""}`} onClick={() => { favorites.toggleMap(map, source); setFavoriteVersion((value) => value + 1); }}><Heart size={20} fill={isFavorite ? "currentColor" : "none"} /> {isFavorite ? "Saved" : "Save map"}</button>
        </section>
        <div className="detail-stats"><Stat label="Completions" value={formatNumber(map.individual_finish_count)} /><Stat label="Difficulty" value={getDifficulty(map)?.toFixed(1) || "—"} /><Stat label="Released" value={formatDate(map.released)} /><Stat label="Records" value={formatNumber(map.difficulty?.[fps]?.nb_tops)} /></div>
        <section className="data-panel detail-panel"><header className="detail-panel-header"><div><p>Map records</p><h2>Top runs</h2></div><div className="filter-options">{["43", "76", "125", "250", "333", "0"].map((value) => <Choice key={value} value={value} current={fps} onSelect={setFps}>{value === "0" ? "mix" : value}</Choice>)}</div></header><RunsTable runs={data?.tops || []} source={source} playerLinks /></section>
      </>}
    </Page>
  );
}

export function PlayerDetailPage() {
  const source = (query().get("source") === "j4l" ? "j4l" : "jh") as Source;
  const playerid = Number(query().get("playerid"));
  const [fps, setFps] = useState("125");
  const [favoriteVersion, setFavoriteVersion] = useState(0);
  const { data, loading, error, reload } = useAsync(async (signal) => {
    const [players, stats, tops] = await Promise.all([api.players(source, signal), api.playerStats(source, playerid, signal), api.playerTops(source, playerid, fps, signal)]);
    return { player: players.find((entry) => entry.player_id === playerid) || null, stats, tops };
  }, [source, playerid, fps]);
  const player = data?.player;
  const stats = data?.stats;
  const isFavorite = Boolean(player && favorites.players().some((entry) => entry.player_id === player.player_id && entry.source === source));
  void favoriteVersion;

  const recent = useMemo(() => Array.isArray(stats?.recent_tops) ? stats.recent_tops as Array<Record<string, unknown>> : [], [stats]);
  return (
    <Page active="/players" accent="teal">
      <a className="back-link" href="/players"><ArrowLeft size={16} /> Back to players</a>
      {loading && <SkeletonRows count={6} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !player && <ErrorState message="This player was not found in the selected data source." />}
      {player && <>
        <section className="detail-hero player-detail-hero"><span className="profile-avatar">{cleanName(player.pref_name || player.playername).slice(0, 1)}</span><div className="detail-title"><p>Player #{player.player_id}</p><h1>{cleanName(player.pref_name || player.playername)}</h1><span>{player.country || "Unknown country"} · Last seen {timeAgo(player.last_seen)}</span><div className="tag-row">{(player.admin || 0) >= 90 && <span>Admin</span>}{(player.donated || 0) > 0 && <span>Donator</span>}<span>{source === "jh" ? "Jumpers Heaven" : "Jump 4 Life"}</span></div></div><button className={`favorite-button large ${isFavorite ? "selected" : ""}`} onClick={() => { favorites.togglePlayer(player, source); setFavoriteVersion((value) => value + 1); }}><Heart size={20} fill={isFavorite ? "currentColor" : "none"} /> {isFavorite ? "Saved" : "Save player"}</button></section>
        <div className="detail-stats"><Stat label="Maps completed" value={formatNumber(stats?.total_maps_completed)} /><Stat label="Top 10 records" value={formatNumber(stats?.top10_count)} /><Stat label="Best rank" value={stats?.best_rank ? `#${stats.best_rank}` : "—"} /><Stat label="Visits" value={formatNumber(player.visits)} /></div>
        <div className="profile-panels"><section className="data-panel"><header className="detail-panel-header"><div><p>Performance</p><h2>Overview</h2></div></header><div className="metric-list"><span><Gauge /> Completion ratio <strong>{typeof stats?.maps_completed_ratio === "number" ? `${Math.round(stats.maps_completed_ratio * 100)}%` : "—"}</strong></span><span><Trophy /> Average rank <strong>{typeof stats?.average_rank === "number" ? Number(stats.average_rank).toFixed(1) : "—"}</strong></span><span><Users /> Activity <strong>{String(stats?.activity_level || "Unknown")}</strong></span><span><CalendarDays /> Best FPS <strong>{String(stats?.best_fps || "—")}</strong></span></div></section><section className="data-panel"><header className="detail-panel-header"><div><p>Latest activity</p><h2>Recent records</h2></div></header><div className="recent-list">{recent.slice(0, 6).map((run, index) => <span key={index}><b>#{String(run.rank || "—")}</b><strong>{String(run.map_name || "Unknown map")}</strong><small>{String(run.fps || "—")} FPS · {formatDate(String(run.finish_date || ""))}</small></span>)}{!recent.length && <p>No recent records.</p>}</div></section></div>
        <section className="data-panel detail-panel"><header className="detail-panel-header"><div><p>Personal records</p><h2>Top runs</h2></div><div className="filter-options">{["43", "76", "125", "250", "333", "0"].map((value) => <Choice key={value} value={value} current={fps} onSelect={setFps}>{value === "0" ? "mix" : value}</Choice>)}</div></header><RunsTable runs={data?.tops || []} source={source} /></section>
      </>}
    </Page>
  );
}

function RunsTable({ runs, source, playerLinks }: { runs: TopRun[]; source: Source; playerLinks?: boolean }) {
  return <div className="table-scroll"><table className="data-table runs-table"><thead><tr><th>Rank</th><th>{playerLinks ? "Player" : "Map"}</th><th>Time</th><th>Loads / Saves</th><th>Date</th></tr></thead><tbody>{runs.map((run, index) => <tr key={`${run.player_id}-${run.cpid}-${index}`}><td><span className={`rank rank-${run.rank}`}>#{run.rank || index + 1}</span></td><td>{playerLinks ? <a href={`/player?playerid=${run.player_id}&source=${source}`}><UserRound size={15} /> {cleanName(run.playername || run.player_name)}</a> : <a href={`/map?source=${source}&cpid=${run.cpid}`}>{run.mapname || "Unknown map"}</a>}</td><td><strong>{run.time_played_string || `${formatNumber(run.time_played)}s`}</strong></td><td>{formatNumber(run.load_count)} / {formatNumber(run.save_count)}</td><td>{formatDate(run.time_created)}</td></tr>)}</tbody></table>{!runs.length && <p className="table-empty">No runs found at this FPS.</p>}</div>;
}
