import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Film,
  Heart,
  Map as MapIcon,
  Route,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
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
import { FPS_VALUES, type Fps, type TopRun } from "../../lib/api";
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
  getPlainPlayerName,
  getSafeMediaUrl,
  mapDetailQuerySchema,
  selectCheckpoint,
  type MapLookup,
} from "./mapDetailModel";
import { useMapRecord, useMapTopRuns } from "./useMapDetail";
import "./maps.css";

const numberFormatter = new Intl.NumberFormat();

export function MapDetailPage({ mapId }: { mapId: string }) {
  const location = useBrowserLocation();
  const { source, setSource } = useSourceContext();
  const [selection, setSelection] = useQueryState(mapDetailQuerySchema);
  const [favoriteAnnouncement, setFavoriteAnnouncement] = useState("");
  const favoriteDocument = useFavorites();
  const lookup: MapLookup =
    new URLSearchParams(location.search).get("lookup") === "cpid" ? "cpid" : "mapid";
  const mapRequest = useMapRecord({ mapId, lookup, source });
  const selectedMap = mapRequest.data ? selectCheckpoint(mapRequest.data, selection.cp) : null;
  const runsRequest = useMapTopRuns({
    checkpointId: selectedMap?.cp_id ?? null,
    fps: selection.fps,
    source,
  });
  const runColumns = useRunColumns(source);

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
              <span>{selectedMap.mapname.slice(0, 2).toUpperCase()}</span>
              <MapIcon size={42} />
            </div>
            <div className="cjs-map-detail__identity">
              <p className="cjs-map-detail__eyebrow">Map record</p>
              <h1>{selectedMap.mapname}</h1>
              <p>
                {selectedMap.author?.trim()
                  ? `Created by ${selectedMap.author}`
                  : "Map author not available"}
              </p>
              <div className="cjs-map-detail__badges">
                <Badge icon={<Route size={14} />}>
                  {selectedMap.type?.trim() || "Route type unavailable"}
                </Badge>
                <Badge>Checkpoint {selectedMap.cp_id}</Badge>
                <Badge tone="information">{sourceLabel(source)}</Badge>
              </div>
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
              <MapMediaLink value={selectedMap.video} />
            </div>
          </header>

          <VisuallyHidden aria-live="polite">{favoriteAnnouncement}</VisuallyHidden>

          <Panel className="cjs-map-detail__controls" variant="strong">
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
            <Select
              label="Checkpoint"
              value={String(selectedMap.cp_id)}
              onChange={(event) => {
                const checkpointId = Number(event.currentTarget.value);
                setSelection({
                  cp: checkpointId === mapRequest.data?.defaultCheckpointId ? 0 : checkpointId,
                });
              }}
              helperText={`${mapRequest.data.checkpoints.length} checkpoint${mapRequest.data.checkpoints.length === 1 ? "" : "s"} available`}
            >
              {mapRequest.data.checkpoints.map((checkpoint, index) => (
                <option value={checkpoint.cp_id} key={checkpoint.cp_id}>
                  Checkpoint {index + 1} (CP {checkpoint.cp_id})
                </option>
              ))}
            </Select>
            <Select
              label="FPS"
              value={selection.fps}
              onChange={(event) => setSelection({ fps: event.currentTarget.value as Fps })}
              helperText="Saved in this page's URL"
            >
              {FPS_VALUES.map((fps) => (
                <option value={fps} key={fps}>
                  {fps === "0" ? "Generic / unspecified" : `${fps} FPS`}
                </option>
              ))}
            </Select>
          </Panel>

          <MapSummary map={selectedMap} fps={selection.fps} />

          <section className="cjs-map-detail__runs" aria-labelledby="map-top-runs-heading">
            <div className="cjs-map-detail__section-heading">
              <div>
                <p className="cjs-map-detail__eyebrow">Checkpoint {selectedMap.cp_id}</p>
                <h2 id="map-top-runs-heading">Top runs at {fpsLabel(selection.fps)}</h2>
              </div>
              {runsRequest.status === "loading" && <span role="status">Loading selected runs</span>}
            </div>

            {runsRequest.status === "loading" && (
              <SkeletonGroup count={5} label="Loading top runs" />
            )}
            {runsRequest.status === "error" && (
              <ErrorState
                title="Top runs could not be loaded"
                description={runsRequest.error ?? "The top-runs request failed."}
                onRetry={runsRequest.reload}
                retryLabel="Retry top runs"
              />
            )}
            {runsRequest.status === "success" && runsRequest.data?.length === 0 && (
              <EmptyState
                icon={Trophy}
                title="No top runs at this FPS"
                description="Try another FPS or checkpoint to look for recorded runs."
              />
            )}
            {runsRequest.status === "success" &&
              runsRequest.data &&
              runsRequest.data.length > 0 && (
                <DataTable
                  caption={`Top runs for ${selectedMap.mapname} at ${fpsLabel(selection.fps)}`}
                  columns={runColumns}
                  rows={runsRequest.data}
                  getRowKey={(run) => run.run_id ?? `${run.player_id}-${run.cpid}-${run.rank}`}
                  getRowLabel={(run) => `Rank ${run.rank}, ${getPlainPlayerName(run.playername)}`}
                />
              )}
          </section>
        </>
      )}
    </div>
  );
}

function MapSummary({
  map,
  fps,
}: {
  map: NonNullable<ReturnType<typeof selectCheckpoint>>;
  fps: Fps;
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
        <dd>{difficulty ? formatCount(difficulty.nb_tops) : "Not available"}</dd>
      </div>
      <div>
        <dt>
          <CalendarDays aria-hidden="true" size={15} />
          Released
        </dt>
        <dd>{formatReleaseDate(map.released)}</dd>
      </div>
    </dl>
  );
}

function MapMediaLink({ value }: { value: string | null | undefined }) {
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
  return fps === "0" ? "generic FPS" : `${fps} FPS`;
}

function mapsPath(source: SourceId): string {
  return source === "jh" ? appPaths.maps : `${appPaths.maps}?source=${source}`;
}

function sourceLabel(source: SourceId): string {
  return sourceOptions.find((option) => option.value === source)?.label ?? source;
}
