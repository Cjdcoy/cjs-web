import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Film,
  Heart,
  Map as MapIcon,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CodPlayerName,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Link,
  Panel,
  SegmentedControl,
  Select,
  SkeletonGroup,
  VisuallyHidden,
  type DataTableColumn,
} from "../../components/ui";
import { type Fps, type TopRun } from "../../lib/api";
import { getMapImageSources } from "../../lib/mapImages";
import {
  appPaths,
  playerDetailPath,
  sourceOptions,
  useBrowserLocation,
  useQueryState,
  useSourceContext,
  type SourceId,
} from "../../lib/routing";
import { hasFavorite, toggleMapFavorite, useFavorites } from "../../lib/storage";
import {
  formatRunDate,
  formatRunTime,
  getMapRouteLabel,
  getPlainPlayerName,
  getSafeMediaUrl,
  hasMapTopRuns,
  mapDetailQuerySchema,
  MAP_PROFILE_FPS_VALUES,
  selectCheckpoint,
  selectMapProfileFps,
  type MapLookup,
  type MapProfileFps,
} from "./mapDetailModel";
import { useMapRecord, useMapTopRuns } from "./useMapDetail";
import { ReplayAnalyticsPanel } from "../replay";
import { MapVideos } from "./MapVideos";
import { getMapVideos } from "./mapVideos";
import "./maps.css";

const numberFormatter = new Intl.NumberFormat();

export function MapDetailPage({ mapId }: { mapId: string }) {
  const location = useBrowserLocation();
  const { source, setSource } = useSourceContext();
  const [selection, setSelection] = useQueryState(mapDetailQuerySchema);
  const [favoriteAnnouncement, setFavoriteAnnouncement] = useState("");
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null);
  const favoriteDocument = useFavorites();
  const lookup: MapLookup =
    new URLSearchParams(location.search).get("lookup") === "cpid" ? "cpid" : "mapid";
  const mapRequest = useMapRecord({ mapId, lookup, source });
  const selectedMap = mapRequest.data ? selectCheckpoint(mapRequest.data, selection.cp) : null;
  const selectedFps = selectedMap ? selectMapProfileFps(selectedMap, selection.fps) : selection.fps;
  const selectedFpsHasTops = selectedMap ? hasMapTopRuns(selectedMap, selectedFps) : false;
  const runsRequest = useMapTopRuns({
    checkpointId: selectedFpsHasTops ? (selectedMap?.cp_id ?? null) : null,
    fps: selectedFps,
    source,
  });
  const liveTopCount =
    runsRequest.status === "success"
      ? (runsRequest.data?.[0]?.totalNr ?? runsRequest.data?.length ?? null)
      : null;
  const runColumns = useRunColumns(source);
  const mapVideos = selectedMap ? getMapVideos(selectedMap.mapname, selectedMap.video) : [];

  useEffect(() => {
    if (selectedMap && selection.fps !== selectedFps) {
      setSelection({ fps: selectedFps });
    }
  }, [selectedFps, selectedMap, selection.fps, setSelection]);

  const isFavorite = Boolean(
    selectedMap && hasFavorite(favoriteDocument, "map", source, selectedMap.mapid),
  );

  return (
    <div className="cjs-map-detail cjs-stack">
      <Link className="cjs-map-detail__back" href={mapsPath(source)} variant="standalone">
        <ArrowLeft aria-hidden="true" size={17} />
        Back to maps
      </Link>

      {mapRequest.status === "loading" && (
        <SkeletonGroup
          className="cjs-map-detail__loading"
          count={4}
          label="Loading map details"
          variant="card"
        />
      )}

      {mapRequest.status === "error" && (
        <ErrorState
          title="Map details could not be loaded"
          description={mapRequest.error ?? "The map request failed."}
          onRetry={mapRequest.reload}
          retryLabel="Retry map request"
        />
      )}

      {mapRequest.status === "success" && !mapRequest.data && (
        <EmptyState
          icon={MapIcon}
          title="Map unavailable"
          description="This map is not available in the selected data source, or its link is invalid."
          action={
            <Link href={mapsPath(source)} variant="standalone">
              Browse available maps
            </Link>
          }
        />
      )}

      {mapRequest.status === "success" && mapRequest.data && selectedMap && (
        <>
          <header className="cjs-map-detail__hero">
            <div className="cjs-map-detail__art" aria-hidden="true">
              {failedImagePath !== getMapImageSources(selectedMap.mapname).card ? (
                <img
                  src={getMapImageSources(selectedMap.mapname).card}
                  srcSet={getMapImageSources(selectedMap.mapname).srcSet}
                  sizes="(max-width: 48rem) 100vw, 16rem"
                  alt=""
                  decoding="async"
                  onError={() => setFailedImagePath(getMapImageSources(selectedMap.mapname).card)}
                />
              ) : (
                <>
                  <span>{selectedMap.mapname.slice(0, 2).toUpperCase()}</span>
                  <MapIcon size={42} />
                </>
              )}
            </div>
            <div className="cjs-map-detail__identity">
              <p className="cjs-map-detail__eyebrow">Map record</p>
              <h1>{selectedMap.mapname}</h1>
              <div className="cjs-map-detail__byline">
                <span>
                  {selectedMap.author?.trim()
                    ? `Created by ${selectedMap.author}`
                    : "Map author not available"}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <CalendarDays aria-hidden="true" size={15} />
                  {formatReleaseDate(selectedMap.released)}
                </span>
              </div>
              <MapSummary map={selectedMap} fps={selectedFps} topCount={liveTopCount} />
            </div>
            <div className="cjs-map-detail__hero-actions">
              <IconButton
                label={`${isFavorite ? "Remove" : "Add"} ${selectedMap.mapname} ${isFavorite ? "from" : "to"} favorites`}
                aria-pressed={isFavorite}
                variant="ghost"
                onClick={() => {
                  const added = toggleMapFavorite(selectedMap, source);
                  setFavoriteAnnouncement(
                    `${selectedMap.mapname} ${added ? "added to" : "removed from"} favorites.`,
                  );
                }}
              >
                <Heart aria-hidden="true" size={19} fill={isFavorite ? "currentColor" : "none"} />
              </IconButton>
              <MapMediaLink value={selectedMap.video} videoCount={mapVideos.length} />
            </div>
          </header>

          <VisuallyHidden aria-live="polite">{favoriteAnnouncement}</VisuallyHidden>

          <Panel
            className="cjs-map-detail__controls"
            variant="strong"
            data-has-routes={mapRequest.data.checkpoints.length > 1 || undefined}
          >
            <fieldset>
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
            {mapRequest.data.checkpoints.length > 1 && (
              <Select
                label="Route"
                value={String(selectedMap.cp_id)}
                onChange={(event) => {
                  const checkpointId = Number(event.currentTarget.value);
                  setSelection({
                    cp: checkpointId === mapRequest.data?.defaultCheckpointId ? 0 : checkpointId,
                  });
                }}
                helperText={`${mapRequest.data.checkpoints.length} routes available`}
              >
                {mapRequest.data.checkpoints.map((route, index) => (
                  <option value={route.cp_id} key={route.cp_id}>
                    {getMapRouteLabel(route, index)}
                  </option>
                ))}
              </Select>
            )}
            <fieldset>
              <legend>FPS</legend>
              <SegmentedControl<MapProfileFps>
                ariaLabel="Top runs FPS"
                value={selectedFps}
                onChange={(fps) => setSelection({ fps })}
                options={MAP_PROFILE_FPS_VALUES.map((fps) => {
                  const hasTops = hasMapTopRuns(selectedMap, fps);
                  return {
                    accessibleLabel: `${fpsButtonLabel(fps)}${hasTops ? "" : ", no tops available"}`,
                    disabled: !hasTops,
                    label: fpsButtonLabel(fps),
                    value: fps,
                  };
                })}
              />
            </fieldset>
          </Panel>

          <div
            className="cjs-map-detail__results-layout"
            data-has-replay={source === "j4l" || undefined}
            data-has-sidebar={source === "j4l" || mapVideos.length > 0 || undefined}
          >
            {(source === "j4l" || mapVideos.length > 0) && (
              <aside className="cjs-map-detail__insights cjs-stack" aria-label="Map insights">
                {source === "j4l" && (
                  <ReplayAnalyticsPanel scope={{ mapId: selectedMap.mapid }} source={source} />
                )}
                {mapVideos.length > 0 && (
                  <MapVideos
                    key={selectedMap.mapname}
                    mapName={selectedMap.mapname}
                    videos={mapVideos}
                  />
                )}
              </aside>
            )}

            <section className="cjs-map-detail__runs" aria-labelledby="map-top-runs-heading">
              <div className="cjs-map-detail__section-heading">
                <div>
                  {mapRequest.data.checkpoints.length > 1 && (
                    <p className="cjs-map-detail__eyebrow">
                      {selectedRouteLabel(mapRequest.data.checkpoints, selectedMap.cp_id)}
                    </p>
                  )}
                  <h2 id="map-top-runs-heading">Top runs at {fpsLabel(selectedFps)}</h2>
                </div>
                {runsRequest.status === "loading" && (
                  <span role="status">Loading selected runs</span>
                )}
              </div>

              {runsRequest.status === "loading" && (
                <SkeletonGroup count={5} label="Loading top runs" />
              )}
              {runsRequest.status === "error" && (
                <ErrorState
                  title={`Top runs could not be loaded for ${fpsLabel(selectedFps)} on ${selectedMap.mapname}`}
                  description="The map profile is still available. Try loading these records again."
                  retryLabel="Retry top runs"
                  onRetry={runsRequest.reload}
                />
              )}
              {(!selectedFpsHasTops ||
                (runsRequest.status === "success" && runsRequest.data?.length === 0)) && (
                <EmptyState
                  icon={Trophy}
                  title={`No tops available for ${fpsLabel(selectedFps)} on ${selectedMap.mapname}`}
                  description="Choose another available FPS to view recorded runs."
                />
              )}
              {runsRequest.status === "success" &&
                runsRequest.data &&
                runsRequest.data.length > 0 && (
                  <DataTable
                    caption={`Top runs for ${selectedMap.mapname} at ${fpsLabel(selectedFps)}`}
                    columns={runColumns}
                    rows={runsRequest.data}
                    getRowKey={(run) => run.run_id ?? `${run.player_id}-${run.cpid}-${run.rank}`}
                    getRowLabel={(run) => `Rank ${run.rank}, ${getPlainPlayerName(run.playername)}`}
                  />
                )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function MapSummary({
  map,
  fps,
  topCount,
}: {
  map: NonNullable<ReturnType<typeof selectCheckpoint>>;
  fps: Fps;
  topCount: number | null;
}) {
  const difficulty = map.difficulty?.[fps];

  return (
    <dl className="cjs-map-detail__summary">
      <div>
        <dt>Completions</dt>
        <dd>{formatCount(map.individual_finish_count)}</dd>
      </div>
      <div>
        <dt>{fpsLabel(fps)} difficulty</dt>
        <dd>
          {difficulty && Number.isFinite(difficulty.difficulty)
            ? `${difficulty.difficulty.toFixed(1)} / 10`
            : "Not rated"}
        </dd>
      </div>
      <div>
        <dt>Recorded tops</dt>
        <dd>
          {topCount !== null
            ? formatCount(topCount)
            : difficulty
              ? formatCount(difficulty.nb_tops)
              : "Not available"}
        </dd>
      </div>
    </dl>
  );
}

function MapMediaLink({
  value,
  videoCount,
}: {
  value: string | null | undefined;
  videoCount: number;
}) {
  if (videoCount > 0) {
    return (
      <Link href="#map-videos" variant="standalone">
        <Film aria-hidden="true" size={17} />
        {videoCount === 1 ? "1 map video" : `${videoCount} map videos`}
      </Link>
    );
  }

  const href = getSafeMediaUrl(value);
  if (!href) {
    return (
      <span className="cjs-map-detail__media-unavailable">
        <Film aria-hidden="true" size={17} />
        No verified media link
      </span>
    );
  }

  return (
    <Link href={href} target="_blank" rel="noreferrer noopener" variant="standalone">
      <Film aria-hidden="true" size={17} />
      Watch map video
      <ExternalLink aria-hidden="true" size={14} />
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </Link>
  );
}

function useRunColumns(source: SourceId): readonly DataTableColumn<TopRun>[] {
  return useMemo(
    () => [
      {
        id: "rank",
        header: "Rank",
        priority: "primary" as const,
        cell: (run: TopRun) => <strong>#{run.rank}</strong>,
      },
      {
        id: "player",
        header: "Player",
        priority: "primary" as const,
        cell: (run: TopRun) => (
          <Link href={playerDetailPath(run.player_id, source)} variant="player">
            <CodPlayerName value={run.playername} />
          </Link>
        ),
      },
      {
        id: "time",
        header: "Time",
        cell: (run: TopRun) => formatRunTime(run),
      },
      {
        id: "loads",
        header: "Loads / saves",
        cell: (run: TopRun) => formatLoadsAndSaves(run),
      },
      {
        id: "date",
        header: "Recorded",
        cell: (run: TopRun) => formatRunDate(run.time_created),
      },
    ],
    [source],
  );
}

function formatLoadsAndSaves(run: TopRun): string {
  if (run.load_count === undefined && run.save_count === undefined) return "Not available";
  return `${formatCount(run.load_count)} / ${formatCount(run.save_count)}`;
}

function formatCount(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value)
    ? numberFormatter.format(value)
    : "Not available";
}

function formatReleaseDate(value: string | null | undefined): string {
  if (!value?.trim()) return "Release date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Release date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    parsed,
  );
}

function fpsLabel(fps: Fps): string {
  return fps === "0" ? "mixed FPS" : `${fps} FPS`;
}

function fpsButtonLabel(fps: MapProfileFps): string {
  return fps === "0" ? "Mix" : fps;
}

function selectedRouteLabel(
  routes: readonly NonNullable<ReturnType<typeof selectCheckpoint>>[],
  checkpointId: number,
): string {
  const routeIndex = routes.findIndex((route) => route.cp_id === checkpointId);
  const route = routes[routeIndex];
  return route ? getMapRouteLabel(route, routeIndex) : "Route";
}

function mapsPath(source: SourceId): string {
  return source === "jh" ? appPaths.maps : `${appPaths.maps}?source=${source}`;
}
