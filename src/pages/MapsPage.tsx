import { ChevronDown, Eye, Grid2X2, Heart, List, Map as MapIcon, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { Choice, ErrorState, FilterGroup, Page, SkeletonRows, ToolbarButton } from "../components";
import { useAsync } from "../hooks";
import type { GameMap, Source } from "../types";
import { difficultyLabel, favorites, formatDate, formatNumber, getDifficulty } from "../utils";

type MapType = "all" | "jump" | "defrag" | "surf";
type Video = "all" | "yes" | "no";
type Sort = "completions" | "released" | "difficulty" | "name";

export function MapsPage() {
  const [source, setSource] = useState<Source>("jh");
  const [type, setType] = useState<MapType>("all");
  const [video, setVideo] = useState<Video>("all");
  const [sort, setSort] = useState<Sort>("completions");
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const [hideImage, setHideImage] = useState(false);
  const [hideDifficulty, setHideDifficulty] = useState(false);
  const [hideCompletion, setHideCompletion] = useState(false);
  const [favoriteVersion, setFavoriteVersion] = useState(0);
  const { data, loading, error, reload } = useAsync((signal) => api.maps(source, signal), [source]);

  const favoriteIds = useMemo(
    () => new Set(favorites.maps().filter((map) => map.source === source).map((map) => map.mapid)),
    [favoriteVersion, source],
  );

  const maps = useMemo(() => {
    const values = (data || []).filter((map) => {
      const hasVideo = Boolean(map.video);
      return (
        (type === "all" || map.type?.toLowerCase() === type) &&
        (video === "all" || (video === "yes" ? hasVideo : !hasVideo)) &&
        map.mapname.toLowerCase().includes(query.toLowerCase()) &&
        (map.author || "").toLowerCase().includes(author.toLowerCase())
      );
    });
    return values.sort((a, b) => {
      if (sort === "name") return a.mapname.localeCompare(b.mapname);
      if (sort === "released") return String(b.released || "").localeCompare(String(a.released || ""));
      if (sort === "difficulty") return (getDifficulty(b) ?? -1) - (getDifficulty(a) ?? -1);
      return (b.individual_finish_count || 0) - (a.individual_finish_count || 0);
    });
  }, [data, type, video, query, author, sort]);

  const toggleFavorite = (map: GameMap) => {
    favorites.toggleMap(map, source);
    setFavoriteVersion((value) => value + 1);
  };

  return (
    <Page active="/maps" accent="blue">
      <div className="filters-inline maps-filter-row">
        <FilterGroup label="Server Type" help="Choose which network supplies map data.">
          <Choice value="jh" current={source} onSelect={setSource}>Jumpers Heaven</Choice>
          <Choice value="j4l" current={source} onSelect={setSource}>Jump 4 Life</Choice>
        </FilterGroup>
        <FilterGroup label="Map Type" help="Filter maps by movement mode.">
          <Choice value="all" current={type} onSelect={setType}>All</Choice>
          <Choice value="jump" current={type} onSelect={setType}>Jump</Choice>
          <Choice value="defrag" current={type} onSelect={setType}>Defrag</Choice>
          <Choice value="surf" current={type} onSelect={setType}>Surf</Choice>
        </FilterGroup>
        <FilterGroup label="Filter Maps By" help="Show maps based on video availability.">
          <Choice value="all" current={video} onSelect={setVideo}>All</Choice>
          <Choice value="yes" current={video} onSelect={setVideo}>Has videos</Choice>
          <Choice value="no" current={video} onSelect={setVideo}>No videos</Choice>
        </FilterGroup>
      </div>

      <FilterGroup label="Hide Maps Info" help="Reduce the amount of information shown in every row." className="hide-options">
        <Toggle checked={hideImage} onChange={setHideImage}>Map Image</Toggle>
        <Toggle checked={hideDifficulty} onChange={setHideDifficulty}>Difficulties</Toggle>
        <Toggle checked={hideCompletion} onChange={setHideCompletion}>Completion Rate</Toggle>
      </FilterGroup>

      <div className="list-toolbar map-toolbar">
        <label className="select-field"><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="completions">Most Completions</option><option value="released">Newest Release</option><option value="difficulty">Highest Difficulty</option><option value="name">Map Name</option></select><ChevronDown size={15} /></label>
        <label className="input-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search maps by name..." /></label>
        <label className="input-field"><input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Maps by author name..." /></label>
        <p>Showing <strong>{maps.length}</strong> of {data?.length || 0} maps</p>
        <div className="toolbar-actions">
          <ToolbarButton label="More filters"><SlidersHorizontal size={16} /></ToolbarButton>
          <ToolbarButton label="Column visibility"><Eye size={16} /></ToolbarButton>
          <ToolbarButton label="Grid view" active={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} /></ToolbarButton>
          <ToolbarButton label="List view" active={view === "list"} onClick={() => setView("list")}><List size={16} /></ToolbarButton>
        </div>
      </div>

      {loading && <SkeletonRows count={5} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (
        <section className={`maps-results ${view === "grid" ? "grid-view" : ""}`}>
          {maps.slice(0, 250).map((map) => (
            <MapCard key={map.mapid} map={map} source={source} favorite={favoriteIds.has(map.mapid)} toggleFavorite={() => toggleFavorite(map)} hideImage={hideImage} hideDifficulty={hideDifficulty} hideCompletion={hideCompletion} />
          ))}
          {!maps.length && <div className="empty-inline"><MapIcon /><strong>No maps found</strong><span>Try a broader map or author search.</span></div>}
        </section>
      )}
    </Page>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: string }) {
  return <label className="check-choice"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span />{children}</label>;
}

export function MapCard({ map, source, favorite, toggleFavorite, hideImage = false, hideDifficulty = false, hideCompletion = false }: { map: GameMap; source: Source; favorite: boolean; toggleFavorite: () => void; hideImage?: boolean; hideDifficulty?: boolean; hideCompletion?: boolean }) {
  const difficulty = getDifficulty(map);
  return (
    <article className={`map-card ${hideImage ? "without-image" : ""}`}>
      {!hideImage && <a className="map-art" href={`/map?mapid=${map.mapid}&source=${source}`}><span>{map.mapname.slice(0, 2).toUpperCase()}</span><MapIcon size={35} /></a>}
      <div className="map-main">
        <div className="map-heading">
          <div><a href={`/map?mapid=${map.mapid}&source=${source}`}>{map.mapname}</a><p>by <strong>{map.author || "Unknown"}</strong></p></div>
          <button className={`favorite-button ${favorite ? "selected" : ""}`} onClick={toggleFavorite} aria-label="Toggle favorite"><Heart size={18} fill={favorite ? "currentColor" : "none"} /></button>
        </div>
        <div className="tag-row"><span>{map.type || "jump"}</span><span>COD2</span><span>Released {formatDate(map.released)}</span></div>
      </div>
      {!hideDifficulty && <div className="map-metric"><span>125 FPS difficulty</span><strong>{difficultyLabel(difficulty)}</strong><small>{difficulty === null ? "Not rated" : `${difficulty.toFixed(1)} / 10`}</small></div>}
      {!hideCompletion && <div className="map-metric"><span>Completions</span><strong>{formatNumber(map.individual_finish_count)}</strong><small>{formatNumber(map.difficulty?.["125"]?.nb_tops)} recorded tops</small></div>}
    </article>
  );
}
