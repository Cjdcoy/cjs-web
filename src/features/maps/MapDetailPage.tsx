import {
  ArrowLeft,
  Box,
  CalendarDays,
  CircleHelp,
  Clock3,
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
import { hasMapModels } from "../../lib/mapModels";
import {
  appPaths,
  mapViewerPath,
  playerDetailPath,
  sourceOptions,
  useBrowserLocation,
  useQueryState,
  useSourceContext,
  type SourceId,
} from "../../lib/routing";
import { hasFavorite, toggleMapFavorite, useFavorites } from "../../lib/storage";
import {
  describeUnratedDifficulty,
  formatRunDate,
  formatPlaytime,
  formatRunTime,
  getMapRouteLabel,
  getPlaytimeRouteEnder,
  getPlainPlayerName,
  getSafeMediaUrl,
  hasMapTopRuns,
  mapDetailQuerySchema,
  MAP_PROFILE_FPS_VALUES,
  PLAYTIME_FPS_VALUES,
  selectCheckpoint,
  selectMapProfileFps,
  type MapDetailView,
  type MapLookup,
  type MapProfileFps,
  type PlaytimeFps,
  type PlaytimeRow,
} from "./mapDetailModel";
import { MOST_PLAYED_LIMIT, useMapPlaytime, useMapRecord, useMapTopRuns } from "./useMapDetail";
import { ReplayLink } from "../../components/ReplayLink";
import { ReplayAnalyticsPanel } from "../replay";
import { MapVideos } from "./MapVideos";
import { getMapVideos } from "./mapVideoModel";
import "./maps.css";

const numberFormatter = new Intl.NumberFormat();
// More routes than this switch the route picker from buttons to a dropdown. The largest live map
// has 5 routes, so every current map gets buttons.
const MAX_ROUTE_BUTTONS = 6;

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
  const showMostPlayed = selection.view === "played";
  // Most played at one FPS reuses that FPS's tops for the best-time column; otherwise the tops
  // request stays on the page FPS.
  const topsFps = showMostPlayed && selection.pfps !== "all" ? selection.pfps : selectedFps;
  const topsFpsHasTops = selectedMap ? hasMapTopRuns(selectedMap, topsFps) : false;
  const runsRequest = useMapTopRuns({
    checkpointId: topsFpsHasTops ? (selectedMap?.cp_id ?? null) : null,
    fps: topsFps,
    source,
  });
  const playtimeEnder =
    mapRequest.data && selectedMap ? getPlaytimeRouteEnder(mapRequest.data, selectedMap) : null;
  const playtimeRequest = useMapPlaytime({
    mapId: selectedMap?.mapid ?? 0,
    fps: showMostPlayed && selectedMap ? selection.pfps : null,
    ender: playtimeEnder,
    source,
  });
  const liveTopCount =
    runsRequest.status === "success" && topsFps === selectedFps
      ? (runsRequest.data?.[0]?.totalNr ?? runsRequest.data?.length ?? null)
      : null;
  const runColumns = useRunColumns(source);
  const mapVideos = selectedMap ? getMapVideos(selectedMap.mapname, selectedMap.video) : [];

  useEffect(() => {
    if (selectedMap && selection.fps !== selectedFps) {
      setSelection({ fps: selectedFps });
    }
  }, [selectedFps, selectedMap, selection.fps, setSelection]);

  const selectRoute = (value: string) => {
    const checkpointId = Number(value);
    setSelection({
      cp: checkpointId === mapRequest.data?.defaultCheckpointId ? 0 : checkpointId,
    });
  };

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
              {hasMapModels() && (
                <Link href={mapViewerPath(selectedMap.mapid, source)} variant="standalone">
                  <Box aria-hidden="true" size={17} />
                  View in 3D
                </Link>
              )}
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
            <fieldset>
              <legend>FPS</legend>
              {showMostPlayed ? (
                <SegmentedControl<PlaytimeFps>
                  ariaLabel="Most played FPS"
                  value={selection.pfps}
                  onChange={(pfps) => setSelection({ pfps })}
                  options={PLAYTIME_FPS_VALUES.map((fps) => ({
                    accessibleLabel: fps === "all" ? "All FPS combined" : fpsButtonLabel(fps),
                    label: fps === "all" ? "All" : fpsButtonLabel(fps),
                    value: fps,
                  }))}
                />
              ) : (
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
              )}
            </fieldset>
            {mapRequest.data.checkpoints.length > MAX_ROUTE_BUTTONS ? (
              <Select
                label="Route"
                value={String(selectedMap.cp_id)}
                onChange={(event) => selectRoute(event.currentTarget.value)}
              >
                {mapRequest.data.checkpoints.map((route, index) => (
                  <option value={route.cp_id} key={route.cp_id}>
                    {getMapRouteLabel(route, index)}
                  </option>
                ))}
              </Select>
            ) : (
              mapRequest.data.checkpoints.length > 1 && (
                <fieldset>
                  <legend>Route</legend>
                  <SegmentedControl<string>
                    ariaLabel="Route"
                    className="cjs-map-detail__routes"
                    value={String(selectedMap.cp_id)}
                    onChange={selectRoute}
                    options={mapRequest.data.checkpoints.map((route, index) => ({
                      label: getMapRouteLabel(route, index),
                      value: String(route.cp_id),
                    }))}
                  />
                </fieldset>
              )
            )}
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

            <section
              className="cjs-map-detail__runs"
              aria-labelledby={showMostPlayed ? "map-most-played-heading" : "map-top-runs-heading"}
            >
              <SegmentedControl<MapDetailView>
                ariaLabel="Map records"
                className="cjs-map-detail__view-switch"
                value={selection.view}
                onChange={(view) => setSelection({ view })}
                options={[
                  {
                    label: (
                      <>
                        <Trophy aria-hidden="true" size={16} /> Top runs
                      </>
                    ),
                    accessibleLabel: "Top runs",
                    value: "tops",
                  },
                  {
                    label: (
                      <>
                        <Clock3 aria-hidden="true" size={16} /> Most played
                      </>
                    ),
                    accessibleLabel: "Most played",
                    value: "played",
                  },
                ]}
              />
              {showMostPlayed ? (
                <MostPlayed
                  fps={selection.pfps}
                  mapName={selectedMap.mapname}
                  request={playtimeRequest}
                  routeScope={
                    mapRequest.data.checkpoints.length < 2
                      ? null
                      : playtimeEnder
                        ? `on route ${selectedRouteLabel(mapRequest.data.checkpoints, selectedMap.cp_id)}`
                        : "all routes"
                  }
                  source={source}
                  tops={
                    selection.pfps !== "all" && runsRequest.status === "success"
                      ? runsRequest.data
                      : null
                  }
                />
              ) : (
                <>
                  <div className="cjs-map-detail__section-heading">
                    <div>
                      {mapRequest.data.checkpoints.length > 1 && (
                        <p className="cjs-map-detail__eyebrow">
                          {routeEyebrow(mapRequest.data.checkpoints, selectedMap.cp_id)}
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
                        getRowKey={(run) =>
                          run.run_id ?? `${run.player_id}-${run.cpid}-${run.rank}`
                        }
                        getRowLabel={(run) =>
                          `Rank ${run.rank}, ${getPlainPlayerName(run.playername)}`
                        }
                      />
                    )}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function MostPlayed({
  fps,
  mapName,
  request,
  routeScope,
  source,
  tops,
}: {
  fps: PlaytimeFps;
  mapName: string;
  request: ReturnType<typeof useMapPlaytime>;
  /** "on Route 2: hard" or "all routes" on multi-route maps, null on single-route maps. */
  routeScope: string | null;
  source: SourceId;
  /** Tops at `fps` for the selected route, or null when there is no single FPS to match. */
  tops: readonly TopRun[] | null;
}) {
  const label = fps === "all" ? "all FPS" : fpsLabel(fps);
  const bestRuns = useMemo(() => {
    const byPlayer = new Map<number, TopRun>();
    for (const run of tops ?? [])
      if (!byPlayer.has(run.player_id)) byPlayer.set(run.player_id, run);
    return byPlayer;
  }, [tops]);
  const columns = useMemo<readonly DataTableColumn<PlaytimeRow & { rank: number }>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        priority: "primary",
        cell: (row) => <strong>#{row.rank}</strong>,
      },
      {
        id: "player",
        header: "Player",
        priority: "primary",
        cell: (row) => (
          <Link href={playerDetailPath(row.player_id, source)} variant="player">
            <CodPlayerName value={row.player_name} />
          </Link>
        ),
      },
      {
        id: "playtime",
        header: "Playtime",
        align: "center",
        cell: (row) => formatPlaytime(row.time_played),
      },
      fps === "all"
        ? {
            id: "fps",
            header: "FPS",
            align: "center",
            cell: (row) => row.fps.map(fpsButtonLabel).join(", "),
          }
        : {
            id: "best",
            header: routeScope ? "Best time on route" : "Best time",
            align: "center",
            cell: (row) => {
              const run = bestRuns.get(row.player_id);
              return run ? `${formatRunTime(run)} (#${run.rank})` : "—";
            },
          },
    ],
    [bestRuns, fps, routeScope, source],
  );
  const rows = useMemo(
    () => (request.data ?? []).map((row, index) => ({ ...row, rank: index + 1 })),
    [request.data],
  );

  return (
    <>
      <div className="cjs-map-detail__section-heading">
        <div>
          <h2 id="map-most-played-heading">
            Most played at {label}
            {routeScope && (
              <>
                {" "}
                <span className="cjs-map-detail__heading-scope">({routeScope})</span>
              </>
            )}
          </h2>
          <p className="cjs-map-detail__note">
            Each run counts up to its latest checkpoint
            {fps === "all" ? "; All adds up 125, 250, 333 and mixed FPS." : "."}
          </p>
        </div>
        {request.status === "loading" && <span role="status">Loading playtime</span>}
      </div>

      {request.status === "loading" && <SkeletonGroup count={5} label="Loading playtime" />}
      {request.status === "error" && (
        <ErrorState
          title={`Playtime could not be loaded for ${label} on ${mapName}`}
          description={request.error ?? "The playtime request failed."}
          retryLabel="Retry playtime"
          onRetry={request.reload}
        />
      )}
      {request.status === "success" && rows.length === 0 && (
        <EmptyState
          icon={Clock3}
          title={`No playtime recorded at ${label} on ${mapName}`}
          description="Choose another FPS to see who played this map the most."
        />
      )}
      {request.status === "success" && rows.length > 0 && (
        <DataTable
          caption={`Top ${MOST_PLAYED_LIMIT} players by playtime on ${mapName} at ${label}`}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.player_id}
          getRowLabel={(row) => `Rank ${row.rank}, ${getPlainPlayerName(row.player_name)}`}
        />
      )}
    </>
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
  const unratedReason = describeUnratedDifficulty(map, fps);

  return (
    <dl className="cjs-map-detail__summary">
      <div>
        <dt>Completions</dt>
        <dd>{map.individual_finish_count ? formatCount(map.individual_finish_count) : "No"}</dd>
      </div>
      <div>
        <dt>{fpsLabel(fps)} difficulty</dt>
        <dd>
          {difficulty && Number.isFinite(difficulty.difficulty) && difficulty.difficulty >= 0 ? (
            `${difficulty.difficulty.toFixed(1)} / 10`
          ) : (
            <>
              Not rated{" "}
              <span
                className="cjs-map-detail__hint"
                role="img"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the title tooltip is reachable by keyboard
                tabIndex={0}
                title={unratedReason}
                aria-label={`Why not rated: ${unratedReason}`}
              >
                <CircleHelp size={14} aria-hidden="true" />
              </span>
            </>
          )}
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
        align: "center" as const,
        cell: (run: TopRun) => formatRunTime(run),
      },
      {
        id: "nadejumps",
        header: "Nade jumps",
        align: "center" as const,
        cell: (run: TopRun) => formatCount(run.nadejumps),
      },
      {
        id: "loads",
        header: "Loads / saves",
        align: "center" as const,
        cell: (run: TopRun) => formatLoadsAndSaves(run),
      },
      {
        id: "date",
        header: "Recorded",
        align: "center" as const,
        cell: (run: TopRun) => formatRunDate(run.time_created),
      },
      ...(source === "j4l" && hasMapModels()
        ? [
            {
              id: "replay",
              header: "Replay",
              align: "center" as const,
              cell: (run: TopRun) => (
                <ReplayLink
                  label={`Watch ${getPlainPlayerName(run.playername)}'s replay, rank ${run.rank}`}
                  runId={run.run_id}
                  source={source}
                />
              ),
            },
          ]
        : []),
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

/** "Route: Extreme" for a named route, so a bare name like "250" is not read as an FPS. */
function routeEyebrow(
  routes: readonly NonNullable<ReturnType<typeof selectCheckpoint>>[],
  checkpointId: number,
): string {
  const label = selectedRouteLabel(routes, checkpointId);
  return /^Route \d+$/.test(label) ? label : `Route: ${label}`;
}

function mapsPath(source: SourceId): string {
  return source === "jh" ? appPaths.maps : `${appPaths.maps}?source=${source}`;
}
