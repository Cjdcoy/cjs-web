import { ChevronDown, Eye, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { Choice, ErrorState, FilterGroup, Page, SkeletonRows, ToolbarButton } from "../components";
import { useAsync } from "../hooks";
import type { LeaderboardEntry, Source } from "../types";
import { cleanName, formatNumber } from "../utils";

const boards = [
  ["speed-skill", "Speedrun"],
  ["jump-skill", "Raw Skill"],
  ["defrag-skill", "Defrag"],
  ["surf-skill", "Surf"],
  ["howmany", "Route Completion"],
  ["rank-xp", "Rank XP"],
] as const;

type Board = (typeof boards)[number][0];
type Region = "Global" | "NA" | "EU" | "AS" | "OC" | "SA" | "AF";
type Seen = "today" | "week" | "month" | "long" | "all";

export function LeaderboardsPage() {
  const [source, setSource] = useState<Source>("jh");
  const [board, setBoard] = useState<Board>("speed-skill");
  const [fps, setFps] = useState("125");
  const [region, setRegion] = useState<Region>("Global");
  const [seen, setSeen] = useState<Seen>("all");
  const [playerQuery, setPlayerQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const { data, loading, error, reload } = useAsync(
    (signal) => api.leaderboard(board, source, board === "howmany" || board === "rank-xp" ? undefined : fps, signal),
    [board, source, fps],
  );

  const rows = useMemo(() => {
    const now = Date.now();
    const maxAge: Record<Seen, number> = {
      today: 864e5,
      week: 864e5 * 7,
      month: 864e5 * 31,
      long: 864e5 * 365,
      all: Number.POSITIVE_INFINITY,
    };
    return (data || []).filter((entry) => {
      const name = cleanName(entry.player_name || entry.playername || "").toLowerCase();
      const country = `${entry.country || ""} ${entry.country_code || ""}`.toLowerCase();
      const age = entry.last_seen ? now - new Date(entry.last_seen.replace(" ", "T") + "Z").getTime() : Infinity;
      return (
        name.includes(playerQuery.toLowerCase()) &&
        country.includes(countryQuery.toLowerCase()) &&
        (region === "Global" || entry.region?.toUpperCase().startsWith(region)) &&
        (seen === "all" || age <= maxAge[seen])
      );
    });
  }, [data, playerQuery, countryQuery, region, seen]);

  return (
    <Page active="/leaderboards" accent="orange">
      <div className="filter-card-grid leaderboard-filters">
        <FilterGroup label="Server Type" className="filter-card">
          <Choice value="jh" current={source} onSelect={setSource}>Jumpers Heaven</Choice>
          <Choice value="j4l" current={source} onSelect={setSource}>Jump 4 Life</Choice>
        </FilterGroup>
        <FilterGroup label="Leaderboard Type" className="filter-card">
          {boards.map(([value, label]) => (
            <Choice key={value} value={value} current={board} onSelect={setBoard} disabled={value === "rank-xp" && source === "jh"}>
              {label}
            </Choice>
          ))}
        </FilterGroup>
        <FilterGroup label="FPS Status" className="filter-card">
          {["43", "76", "125", "250", "333", "0"].map((value) => (
            <Choice key={value} value={value} current={fps} onSelect={setFps} disabled={board === "howmany" || board === "rank-xp"}>
              {value === "0" ? "mix" : value}
            </Choice>
          ))}
        </FilterGroup>
        <FilterGroup label="Players Region" className="filter-card">
          {(["Global", "NA", "EU", "AS", "OC", "SA", "AF"] as Region[]).map((value) => (
            <Choice key={value} value={value} current={region} onSelect={setRegion}>{value}</Choice>
          ))}
        </FilterGroup>
        <FilterGroup label="Last Seen" className="filter-card">
          <Choice value="today" current={seen} onSelect={setSeen}>Today</Choice>
          <Choice value="week" current={seen} onSelect={setSeen}>This Week</Choice>
          <Choice value="month" current={seen} onSelect={setSeen}>This Month</Choice>
          <Choice value="long" current={seen} onSelect={setSeen}>Long Time</Choice>
          <Choice value="all" current={seen} onSelect={setSeen}>All time</Choice>
        </FilterGroup>
      </div>

      <section className="data-panel leaderboard-panel">
        <header className="data-panel-toolbar">
          <h1>Top Players</h1>
          <input value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="Search by player name..." />
          <input value={countryQuery} onChange={(event) => setCountryQuery(event.target.value)} placeholder="Search by country name..." />
          <p>Showing <strong>{rows.length}</strong> of {data?.length || 0} players</p>
          <div className="toolbar-actions">
            <ToolbarButton label="Collapse"><Minus size={16} /></ToolbarButton>
            <ToolbarButton label="More filters"><ChevronDown size={16} /></ToolbarButton>
            <ToolbarButton label="Column visibility"><Eye size={17} /></ToolbarButton>
          </div>
        </header>
        {loading && <SkeletonRows count={8} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && <LeaderboardTable rows={rows.slice(0, 200)} source={source} />}
      </section>
    </Page>
  );
}

function LeaderboardTable({ rows, source }: { rows: LeaderboardEntry[]; source: Source }) {
  return (
    <div className="table-scroll">
      <table className="data-table leaderboard-table">
        <thead><tr><th>Rank ↕</th><th>Player</th><th>Rating</th><th>Points</th><th>Tops 1–10</th></tr></thead>
        <tbody>
          {rows.map((entry, index) => (
            <tr key={`${entry.player_id}-${index}`}>
              <td><span className={`rank rank-${index + 1}`}>{entry.rank || index + 1}</span></td>
              <td>
                <a className="player-cell" href={`/player?playerid=${entry.player_id}&source=${source}`}>
                  <span className="country-code">{entry.country_code || "--"}</span>
                  <span><strong>{cleanName(entry.player_name || entry.playername)}</strong><small>{entry.country || "Unknown country"}</small></span>
                </a>
              </td>
              <td><strong>{entry.rating === undefined ? "—" : Number(entry.rating).toFixed(2)}</strong></td>
              <td>{formatNumber(entry.score ?? entry.points ?? entry.xp)}</td>
              <td><div className="top-pills">{Object.entries(entry.top_list || {}).slice(0, 10).map(([place, value]) => <span key={place}><b>{place}</b>{formatNumber(value)}</span>)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="table-empty">No players match these filters.</p>}
    </div>
  );
}
