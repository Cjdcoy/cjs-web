import { Film, Grid2X2, List, Map as MapIcon, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  SegmentedControl,
  Select,
  SkeletonGroup,
  VisuallyHidden,
} from "../../components/ui";
import { api, FPS_VALUES, type GameMap } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { sourceOptions, useQueryState, useSourceContext, type SourceId } from "../../lib/routing";
import { selectMapFavorites, toggleMapFavorite, useFavorites } from "../../lib/storage";
import { MapCard } from "./MapCard";
import {
  filterAndSortMaps,
  getAvailableRouteTypes,
  mapDiscoveryQuerySchema,
  prepareMaps,
  type MapView,
} from "./mapDiscovery";
import "./maps.css";

const PAGE_SIZE = 24;

export function MapsPage() {
  const { source, setSource } = useSourceContext();
  const [filters, setFilters] = useQueryState(mapDiscoveryQuerySchema);
  const [favoriteAnnouncement, setFavoriteAnnouncement] = useState("");
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const favoriteDocument = useFavorites();
  const loadMaps = useCallback((signal: AbortSignal) => api.maps({ source, signal }), [source]);
  const { data, error, loading, reload } = useAsync(loadMaps, source);

  const preparedMaps = useMemo(() => prepareMaps(data ?? []), [data]);
  const routeTypes = useMemo(() => getAvailableRouteTypes(preparedMaps), [preparedMaps]);
  const filteredMaps = useMemo(
    () => filterAndSortMaps(preparedMaps, filters),
    [filters, preparedMaps],
  );
  const pageCount = Math.max(1, Math.ceil(filteredMaps.length / PAGE_SIZE));
  const activePage = Math.min(filters.page, pageCount);
  const visibleMaps = filteredMaps.slice(0, activePage * PAGE_SIZE);
  const hasMoreMaps = visibleMaps.length < filteredMaps.length;

  const favoriteIds = useMemo(() => {
    return new Set(
      selectMapFavorites(favoriteDocument)
        .filter((favorite) => favorite.source === source)
        .map((favorite) => favorite.id),
    );
  }, [favoriteDocument, source]);

  useEffect(() => {
    if (loading || data === null || filters.route === "all") return;
    if (!routeTypes.includes(filters.route)) {
      setFilters({ route: "all", page: 1 }, { replace: true });
    }
  }, [data, filters.route, loading, routeTypes, setFilters]);

  useEffect(() => {
    if (!loading && data !== null && filters.page > pageCount) {
      setFilters({ page: pageCount }, { replace: true });
    }
  }, [data, filters.page, loading, pageCount, setFilters]);

  const loadMoreMaps = useCallback(() => {
    if (!hasMoreMaps) return;
    setFilters({ page: Math.min(activePage + 1, pageCount) }, { replace: true });
  }, [activePage, hasMoreMaps, pageCount, setFilters]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (trigger === null || !hasMoreMaps || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.unobserve(trigger);
        loadMoreMaps();
      },
      { rootMargin: "640px 0px", threshold: 0.01 },
    );
    observer.observe(trigger);

    return () => observer.disconnect();
  }, [hasMoreMaps, loadMoreMaps]);

  const updateFilter = <Key extends keyof typeof filters>(
    key: Key,
    value: (typeof filters)[Key],
  ) => {
    setFilters({ [key]: value, page: 1 });
  };

  const resetFilters = () => {
    setFilters({
      q: "",
      route: "all",
      media: "all",
      fps: "125",
      sort: "released",
      view: "grid",
      page: 1,
    });
  };

  const toggleFavorite = (map: GameMap) => {
    const added = toggleMapFavorite(map, source);
    setFavoriteAnnouncement(`${map.mapname} ${added ? "added to" : "removed from"} favorites.`);
  };

  const hasLoadedData = data !== null;
  const firstVisibleResult = filteredMaps.length === 0 ? 0 : 1;
  const lastVisibleResult = Math.min(activePage * PAGE_SIZE, filteredMaps.length);

  return (
    <div className="cjs-maps cjs-stack">
      <header className="cjs-maps__header">
        <div className="cjs-maps__heading cjs-page-heading">
          <span className="cjs-maps__eyebrow cjs-page-heading__eyebrow">
            <MapIcon aria-hidden="true" size={16} />
            Map discovery
          </span>
          <h1>Browse maps</h1>
          <p className="cjs-page-heading__description">
            Search by map or author, compare route types and FPS difficulty, and open a map to view
            its records.
          </p>
        </div>
      </header>

      <Panel className="cjs-maps__filters" padding="small">
        <div className="cjs-maps__filter-grid">
          <fieldset className="cjs-maps__source-field">
            <legend>Data source</legend>
            <SegmentedControl<SourceId>
              ariaLabel="Map data source"
              value={source}
              onChange={setSource}
              options={sourceOptions.map((option) => ({
                accessibleLabel: option.label,
                label: option.shortLabel,
                value: option.value,
              }))}
            />
          </fieldset>

          <Input
            containerClassName="cjs-maps__search-field"
            label="Search maps"
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Map or author name"
            leading={<Search size={16} />}
          />

          <Select
            label="Route type"
            value={routeTypes.includes(filters.route) ? filters.route : "all"}
            onChange={(event) => updateFilter("route", event.target.value)}
          >
            <option value="all">All route types</option>
            {routeTypes.map((routeType) => (
              <option value={routeType} key={routeType}>
                {titleCase(routeType)}
              </option>
            ))}
          </Select>

          <Select
            label="Media"
            value={filters.media}
            onChange={(event) => updateFilter("media", event.target.value as typeof filters.media)}
          >
            <option value="all">Any media status</option>
            <option value="with-media">Video available</option>
            <option value="without-media">No video listed</option>
          </Select>

          <Select
            label="Difficulty FPS"
            value={filters.fps}
            onChange={(event) => updateFilter("fps", event.target.value as typeof filters.fps)}
          >
            {FPS_VALUES.map((fps) => (
              <option value={fps} key={fps}>
                {fps === "0" ? "Generic / unspecified" : `${fps} FPS`}
              </option>
            ))}
          </Select>

          <Select
            label="Sort maps"
            value={filters.sort}
            onChange={(event) => updateFilter("sort", event.target.value as typeof filters.sort)}
          >
            <option value="completions">Most completions</option>
            <option value="released">Newest release</option>
            <option value="difficulty">Highest difficulty</option>
            <option value="name">Map name</option>
          </Select>
        </div>

        <div className="cjs-maps__filter-actions">
          <Button variant="ghost" size="small" onClick={resetFilters}>
            <RotateCcw aria-hidden="true" size={16} />
            Reset filters
          </Button>
          <SegmentedControl<MapView>
            className="cjs-maps__view-control"
            ariaLabel="Map result view"
            value={filters.view}
            onChange={(view) => setFilters({ view })}
            options={[
              {
                value: "list",
                label: <List aria-hidden="true" size={17} />,
                accessibleLabel: "List view",
              },
              {
                value: "grid",
                label: <Grid2X2 aria-hidden="true" size={17} />,
                accessibleLabel: "Grid view",
              },
            ]}
          />
        </div>
      </Panel>

      <div className="cjs-maps__results-header">
        <p role="status" aria-label="Map result count" aria-live="polite">
          {hasLoadedData ? (
            <>
              Showing <strong>{firstVisibleResult}</strong>–<strong>{lastVisibleResult}</strong> of{" "}
              <strong>{filteredMaps.length}</strong> matching maps
              {filteredMaps.length !== preparedMaps.length && ` (${preparedMaps.length} total)`}
            </>
          ) : (
            "Loading map count"
          )}
        </p>
        {loading && hasLoadedData && (
          <span className="cjs-maps__refresh-status" role="status">
            <RefreshCw aria-hidden="true" size={15} />
            Refreshing maps
          </span>
        )}
      </div>

      {loading && !hasLoadedData && (
        <SkeletonGroup
          className="cjs-maps__loading"
          label="Loading maps"
          count={6}
          variant="card"
        />
      )}

      {error && !hasLoadedData && (
        <ErrorState
          title="Maps could not be loaded"
          description={error}
          onRetry={reload}
          retryLabel="Retry maps request"
        />
      )}

      {error && hasLoadedData && (
        <Panel className="cjs-maps__stale-warning" role="alert">
          <div>
            <strong>Map refresh failed</strong>
            <p>{error} The last loaded results remain visible.</p>
          </div>
          <Button variant="secondary" size="small" onClick={reload}>
            <RefreshCw aria-hidden="true" size={16} />
            Try again
          </Button>
        </Panel>
      )}

      {!loading && !error && hasLoadedData && preparedMaps.length === 0 && (
        <EmptyState
          icon={MapIcon}
          title="No maps are available"
          description={`The ${source.toUpperCase()} source returned no map records.`}
        />
      )}

      {hasLoadedData && preparedMaps.length > 0 && filteredMaps.length === 0 && (
        <EmptyState
          icon={Film}
          title="No maps match these filters"
          description="Try another route type, FPS, media status, or search term."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Clear map filters
            </Button>
          }
        />
      )}

      {visibleMaps.length > 0 && (
        <section
          className="cjs-maps__results"
          data-view={filters.view}
          aria-label="Map results"
          aria-busy={loading || undefined}
        >
          {visibleMaps.map((item, index) => (
            <MapCard
              key={`${item.map.mapid}:${item.map.cp_id}`}
              priority={index < 4}
              item={item}
              source={source}
              fps={filters.fps}
              favorite={favoriteIds.has(item.map.mapid)}
              onToggleFavorite={() => toggleFavorite(item.map)}
            />
          ))}
        </section>
      )}

      {hasMoreMaps && (
        <div className="cjs-maps__load-more" ref={loadMoreTriggerRef}>
          <Button variant="secondary" onClick={loadMoreMaps}>
            Load more maps
          </Button>
          <p>
            {visibleMaps.length} of {filteredMaps.length} maps loaded. More maps load automatically
            as you scroll.
          </p>
        </div>
      )}

      <VisuallyHidden role="status" aria-live="polite">
        {favoriteAnnouncement}
      </VisuallyHidden>
    </div>
  );
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_\s])\p{L}/gu, (letter) => letter.toUpperCase());
}
