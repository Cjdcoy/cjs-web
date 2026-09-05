import { ChartNoAxesCombined, CircleGauge, ListChecks, Map as MapIcon, Search } from "lucide-react";
import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  SegmentedControl,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import type { Fps, PlayerMapScore, TopRun } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { getMapImageSources } from "../../lib/mapImages";
import { fpsLabel } from "./playerProfileModel";
import {
  createRunProgression,
  formatRunDurationMs,
  type RunProgressPoint,
} from "./runProgressionModel";
import type { ProfileResource } from "./usePlayerProfile";

type PickerMap = Pick<PlayerMapScore, "map_id" | "map_name" | "rank">;

interface PlayerRunProgressionProps {
  fps: Fps;
  fpsFilter: ReactNode;
  mapId: number;
  onMapChange: (mapId: number) => void;
  onRetry: () => void;
  runs: ProfileResource<TopRun[]>;
  tops: ProfileResource<TopRun[]>;
}

export function PlayerRunProgression({
  fps,
  fpsFilter,
  mapId,
  onMapChange,
  onRetry,
  runs,
  tops,
}: PlayerRunProgressionProps) {
  const [mapFilter, setMapFilter] = useState("");
  const maps = useMemo(() => pickerMaps(tops.data ?? []), [tops.data]);
  const filteredMaps = useMemo(() => filterMaps(maps, mapFilter), [mapFilter, maps]);
  const mapSelected = mapId > 0;
  const selectedMap = maps.find((map) => map.map_id === mapId) ?? null;
  const displayedMaps =
    selectedMap && !filteredMaps.some((map) => map.map_id === selectedMap.map_id)
      ? [selectedMap, ...filteredMaps]
      : filteredMaps;
  const filters = (
    <Panel
      aria-label="Run analytics filters"
      className="cjs-run-progress__filters"
      padding="small"
      role="group"
      variant="strong"
    >
      {fpsFilter}
      {(maps.length > 0 || mapId > 0) && (
        <MapPicker
          displayedMaps={displayedMaps}
          filteredCount={filteredMaps.length}
          fps={fps}
          mapFilter={mapFilter}
          mapId={mapId}
          onFilterChange={setMapFilter}
          onMapChange={onMapChange}
          selectedMap={selectedMap}
          totalCount={maps.length}
        />
      )}
    </Panel>
  );

  if (tops.status === "loading" && mapId === 0) {
    return (
      <div className="cjs-run-progress" data-map-selected={mapSelected}>
        {filters}
        <SkeletonGroup count={5} label="Loading analytics maps" />
      </div>
    );
  }

  if (tops.status === "error" && tops.data === null && mapId === 0) {
    return (
      <div className="cjs-run-progress" data-map-selected={mapSelected}>
        {filters}
        <ErrorState
          description="The map list could not be loaded, so run analytics cannot be selected yet."
          onRetry={onRetry}
          title="Analytics maps unavailable"
        />
      </div>
    );
  }

  if (maps.length === 0 && mapId === 0) {
    return (
      <div className="cjs-run-progress" data-map-selected={mapSelected}>
        {filters}
        <EmptyState
          description={`No ranked ${fpsLabel(fps)} maps are published for this player. Try another FPS.`}
          title="No maps to chart"
        />
      </div>
    );
  }

  return (
    <div className="cjs-run-progress" data-map-selected={mapSelected}>
      {filters}
      {mapId === 0 ? (
        <EmptyState
          description="Choose a map to compare every recorded finish in chronological order."
          title="Pick a map"
        />
      ) : (
        <RunHistory
          mapName={selectedMap?.map_name ?? runs.data?.[0]?.mapname ?? `Map #${mapId}`}
          onRetry={onRetry}
          resource={runs}
        />
      )}
    </div>
  );
}

function MapPicker({
  displayedMaps,
  filteredCount,
  fps,
  mapFilter,
  mapId,
  onFilterChange,
  onMapChange,
  selectedMap,
  totalCount,
}: {
  displayedMaps: readonly PickerMap[];
  filteredCount: number;
  fps: Fps;
  mapFilter: string;
  mapId: number;
  onFilterChange: (value: string) => void;
  onMapChange: (mapId: number) => void;
  selectedMap: PickerMap | null;
  totalCount: number;
}) {
  const [hoveredMapId, setHoveredMapId] = useState<number | null>(null);
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null);
  const previewMap = displayedMaps.find((map) => map.map_id === hoveredMapId) ?? selectedMap;
  // Card art is keyed by the bare map name; the tops feed appends the route, e.g. "jm_plazma(Hard)".
  const previewSources =
    previewMap === null ? null : getMapImageSources(previewMap.map_name.replace(/\(.*\)$/, ""));

  return (
    <div className="cjs-run-progress__map-picker">
      <div className="cjs-run-progress__map-search">
        <Input
          helperText={`${filteredCount} of ${totalCount} ranked maps shown at ${fpsLabel(fps)}.`}
          id="player-progress-map"
          label="Find a ranked map"
          leading={<Search size={17} />}
          onChange={(event) => onFilterChange(event.currentTarget.value)}
          placeholder="Search map name"
          type="search"
          value={mapFilter}
        />
        <div
          aria-label="Finished maps"
          className="cjs-run-progress__map-list"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setHoveredMapId(null);
          }}
          onPointerLeave={() => setHoveredMapId(null)}
          role="group"
        >
          {mapId > 0 && !selectedMap && (
            <Button aria-pressed size="small" type="button" variant="secondary">
              Map #{mapId}
            </Button>
          )}
          {displayedMaps.map((map) => (
            <Button
              key={map.map_id}
              aria-pressed={map.map_id === mapId}
              onClick={() => onMapChange(map.map_id)}
              onFocus={() => setHoveredMapId(map.map_id)}
              onPointerEnter={() => setHoveredMapId(map.map_id)}
              size="small"
              type="button"
              variant="secondary"
            >
              {map.map_name} <span className="cjs-run-progress__map-rank">#{map.rank}</span>
            </Button>
          ))}
        </div>
      </div>

      <figure className="cjs-run-progress__map-preview">
        {previewMap && previewSources ? (
          <>
            <span className="cjs-run-progress__map-preview-art">
              {failedImagePath === previewSources.card ? (
                <>
                  <span aria-hidden="true">{previewMap.map_name.slice(0, 2).toUpperCase()}</span>
                  <MapIcon aria-hidden="true" size={28} />
                </>
              ) : (
                <img
                  key={previewMap.map_id}
                  alt={`${previewMap.map_name} preview`}
                  decoding="async"
                  loading="lazy"
                  onError={() => setFailedImagePath(previewSources.card)}
                  sizes="(max-width: 48rem) 100vw, 40rem"
                  src={previewSources.card}
                  srcSet={previewSources.srcSet}
                />
              )}
            </span>
            <figcaption>
              {previewMap.map_name} · #{previewMap.rank}
            </figcaption>
          </>
        ) : (
          <figcaption>Hover a map to preview it.</figcaption>
        )}
      </figure>
    </div>
  );
}

function RunHistory({
  mapName,
  onRetry,
  resource,
}: {
  mapName: string;
  onRetry: () => void;
  resource: ProfileResource<TopRun[]>;
}) {
  const progression = useMemo(() => createRunProgression(resource.data ?? []), [resource.data]);
  const [selectedKey, setSelectedKey] = useState<number | string | null>(null);
  const selectedPoint =
    progression.points.find((point) => pointKey(point) === selectedKey) ??
    progression.points.find((point) => point.timeMs === progression.summary?.bestTimeMs) ??
    progression.points.at(-1) ??
    null;

  if (resource.status === "loading" || resource.status === "unsupported") {
    return <SkeletonGroup count={7} label={`Loading ${mapName} run analytics`} />;
  }

  if (resource.status === "error" && resource.data === null) {
    return (
      <ErrorState
        description={`The recorded finishes for ${mapName} could not be loaded.`}
        onRetry={onRetry}
        title="Run analytics unavailable"
      />
    );
  }

  if (!progression.summary) {
    return (
      <EmptyState
        description="This map has no recorded finishes for the selected player and FPS."
        title="No run history yet"
      />
    );
  }

  const { summary } = progression;
  const columns: readonly DataTableColumn<RunProgressPoint>[] = [
    {
      id: "run",
      header: "Run",
      cell: (point) => <strong>#{point.sequence}</strong>,
    },
    {
      id: "recorded",
      header: "Recorded",
      priority: "primary",
      cell: (point) =>
        point.run.time_created ? formatDate(point.run.time_created) : "Date not provided",
    },
    {
      id: "time",
      header: "Finish time",
      align: "end",
      cell: (point) => <strong>{formatRunDurationMs(point.timeMs)}</strong>,
    },
    {
      id: "previous",
      header: "vs previous",
      align: "end",
      cell: (point) => formatFinishDelta(point.previousFinishDeltaMs),
    },
    {
      id: "best",
      header: "Personal best",
      align: "end",
      cell: (point) =>
        point.sequence === 1 ? (
          <Badge>Baseline</Badge>
        ) : point.personalBestGainMs !== null ? (
          <Badge tone="success">−{formatRunDurationMs(point.personalBestGainMs)}</Badge>
        ) : (
          formatBehindBest(point)
        ),
    },
    {
      id: "inspect",
      header: "Details",
      align: "end",
      cell: (point) => (
        <Button
          aria-pressed={selectedPoint !== null && pointKey(point) === pointKey(selectedPoint)}
          onClick={() => setSelectedKey(pointKey(point))}
          size="small"
          variant="ghost"
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <section className="cjs-run-progress__history" aria-labelledby="run-progress-title">
      {(resource.status === "refreshing" || resource.status === "error") && (
        <p className="cjs-run-progress__stale" role="status">
          {resource.status === "refreshing"
            ? "Refreshing run history; current results remain visible."
            : "Refresh failed; showing the last successful run history."}
        </p>
      )}

      <div className="cjs-run-progress__overview">
        <div className="cjs-run-progress__ledger-heading">
          <span aria-hidden="true">
            <ChartNoAxesCombined size={20} />
          </span>
          <div>
            <h2 id="run-progress-title">{mapName} progression</h2>
            <p>
              {summary.runCount === 1
                ? "One recorded finish so far."
                : `${summary.runCount} finishes from ${formatRunDurationMs(summary.firstTimeMs)} down to ${formatRunDurationMs(summary.bestTimeMs)}.`}
            </p>
          </div>
        </div>

        <dl className="cjs-run-progress__summary" aria-label="Run improvement summary">
          <SummaryStat hero label="Best time" value={formatRunDurationMs(summary.bestTimeMs)} />
          <SummaryStat
            label="Total improvement"
            value={`${formatRunDurationMs(summary.improvementMs)} · ${Math.round(summary.improvementPercent * 100)}%`}
          />
          <SummaryStat label="Finishes" value={String(summary.runCount)} />
          <SummaryStat label="PB improvements" value={String(summary.personalBestCount)} />
          <SummaryStat label="Biggest leap" value={formatRunDurationMs(summary.biggestGainMs)} />
          <SummaryStat label="Median finish" value={formatRunDurationMs(summary.medianTimeMs)} />
        </dl>
      </div>

      <div className="cjs-run-progress__analytics">
        <RunProgressChart
          onSelect={setSelectedKey}
          points={progression.points}
          selectedPoint={selectedPoint}
        />

        {selectedPoint && <RunDetails point={selectedPoint} />}
      </div>

      <div className="cjs-run-progress__ledger">
        <div className="cjs-run-progress__ledger-heading">
          <span aria-hidden="true">
            <ListChecks size={19} />
          </span>
          <div>
            <h3>Run-by-run improvement</h3>
            <p>The table is the complete text alternative to the chart.</p>
          </div>
        </div>

        <DataTable
          caption={`${mapName} run progression from oldest to newest`}
          captionVisible
          columns={columns}
          getRowKey={pointKey}
          getRowLabel={(point) => `Run ${point.sequence}, ${formatRunDurationMs(point.timeMs)}`}
          rows={progression.points}
        />
      </div>
    </section>
  );
}

type AxisMode = "sequence" | "date";
type RangeMode = "all" | "focus";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 340;
const CHART_PADDING = { bottom: 56, left: 76, right: 28, top: 32 };
const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
const PLOT_BOTTOM = CHART_PADDING.top + PLOT_HEIGHT;
const TICK_STEPS_MS = [
  100, 250, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000,
  900_000, 1_800_000, 3_600_000,
];

interface ChartCoordinate {
  bestY: number;
  clipped: boolean;
  index: number;
  point: RunProgressPoint;
  x: number;
  y: number;
}

function RunProgressChart({
  onSelect,
  points,
  selectedPoint,
}: {
  onSelect: (key: number | string) => void;
  points: readonly RunProgressPoint[];
  selectedPoint: RunProgressPoint | null;
}) {
  const [axisMode, setAxisMode] = useState<AxisMode>("sequence");
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const timestamps = points.map((point) => point.timestamp);
  const minTimestamp = Math.min(...timestamps.map((value) => value ?? Number.POSITIVE_INFINITY));
  const maxTimestamp = Math.max(...timestamps.map((value) => value ?? Number.NEGATIVE_INFINITY));
  const dateAxisAvailable =
    points.length > 1 && timestamps.every((value) => value !== null) && maxTimestamp > minTimestamp;
  const useDateAxis = axisMode === "date" && dateAxisAvailable;

  const times = points.map((point) => point.timeMs);
  const sortedTimes = [...times].sort((left, right) => left - right);
  const fastest = sortedTimes[0] ?? 0;
  const slowest = sortedTimes.at(-1) ?? 0;
  const focusCeiling = sortedTimes[Math.floor(0.85 * (sortedTimes.length - 1))] ?? slowest;
  const focusAvailable = points.length >= 5 && slowest > focusCeiling * 1.15;
  const useFocus = rangeMode === "focus" && focusAvailable;
  const ticks = niceTicks(fastest, useFocus ? focusCeiling : slowest);
  const tickStep = (ticks[1] ?? 0) - (ticks[0] ?? 0);
  const yMin = ticks[0] ?? fastest;
  const yMax = ticks.at(-1) ?? slowest;
  const ySpan = Math.max(yMax - yMin, 1);
  const toY = (value: number) =>
    CHART_PADDING.top + ((yMax - Math.min(value, yMax)) / ySpan) * PLOT_HEIGHT;

  const coordinates: ChartCoordinate[] = points.map((point, index) => ({
    bestY: toY(point.personalBestMs),
    clipped: point.timeMs > yMax,
    index,
    point,
    x:
      CHART_PADDING.left +
      (points.length === 1
        ? PLOT_WIDTH / 2
        : useDateAxis
          ? (((point.timestamp ?? minTimestamp) - minTimestamp) / (maxTimestamp - minTimestamp)) *
            PLOT_WIDTH
          : (index / (points.length - 1)) * PLOT_WIDTH),
    y: toY(point.timeMs),
  }));
  const clippedCount = coordinates.filter((coordinate) => coordinate.clipped).length;

  const runLine = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const bestPath = coordinates
    .map(({ bestY, x }, index) => (index === 0 ? `M${x},${bestY}` : `H${x} V${bestY}`))
    .join(" ");
  const dateTicks = useDateAxis
    ? evenlySpacedTimestamps(minTimestamp, maxTimestamp).map((timestamp) => ({
        key: String(timestamp),
        label: formatDate(new Date(timestamp).toISOString()),
        x:
          CHART_PADDING.left +
          ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * PLOT_WIDTH,
      }))
    : getChartDateTickIndexes(points.length).flatMap((index) => {
        const coordinate = coordinates[index];
        return coordinate
          ? [
              {
                key: `date-${pointKey(coordinate.point)}`,
                label: formatDate(coordinate.point.run.time_created),
                x: coordinate.x,
              },
            ]
          : [];
      });
  const dedupedDateTicks = dateTicks.filter(
    (tick, index) => index === 0 || tick.label !== dateTicks[index - 1]?.label,
  );

  const selectedCoordinate =
    selectedPoint === null
      ? null
      : (coordinates.find(({ point }) => pointKey(point) === pointKey(selectedPoint)) ?? null);
  const hoveredCoordinate = hoveredIndex === null ? null : (coordinates[hoveredIndex] ?? null);
  const bestCoordinate = coordinates.find(({ point }) => point.timeMs === fastest) ?? null;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const svgX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    coordinates.forEach(({ x }, index) => {
      const distance = Math.abs(x - svgX);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    setHoveredIndex(nearest);
  };

  const handlePointKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : event.key === "Home"
            ? -index
            : event.key === "End"
              ? points.length - 1 - index
              : 0;
    if (step === 0) return;
    event.preventDefault();
    const buttons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        ".cjs-run-progress__point",
      ) ?? [];
    const target = buttons[(index + step + points.length) % points.length];
    target?.focus();
  };

  return (
    <div className="cjs-run-progress__chart-block">
      <div className="cjs-run-progress__chart-heading">
        <div>
          <h2>Finish-time trend</h2>
          <p id="run-progress-chart-help">
            Lower is faster. Hover or use arrow keys to compare finishes; select one to inspect it.
          </p>
        </div>
        <div className="cjs-run-progress__legend" aria-hidden="true">
          <span data-series="finish">Finish</span>
          <span data-series="best">Personal best</span>
        </div>
      </div>

      <div className="cjs-run-progress__chart-controls">
        <SegmentedControl
          ariaLabel="Chart horizontal axis"
          onChange={setAxisMode}
          options={[
            { value: "sequence", label: "By run" },
            { value: "date", label: "By date", disabled: !dateAxisAvailable },
          ]}
          value={useDateAxis ? "date" : "sequence"}
        />
        <SegmentedControl
          ariaLabel="Chart time range"
          onChange={setRangeMode}
          options={[
            { value: "all", label: "All finishes" },
            {
              value: "focus",
              label: "Hide slow outliers",
              disabled: !focusAvailable,
            },
          ]}
          value={useFocus ? "focus" : "all"}
        />
        {useFocus && (
          <p className="cjs-run-progress__chart-note" role="status">
            {clippedCount} slower {clippedCount === 1 ? "finish" : "finishes"} pinned to the top
            edge.
          </p>
        )}
      </div>

      <div
        className="cjs-run-progress__chart"
        role="group"
        aria-describedby="run-progress-chart-help"
        aria-label="Interactive finish-time chart"
      >
        <div
          className="cjs-run-progress__chart-canvas"
          onPointerLeave={() => setHoveredIndex(null)}
          onPointerMove={handlePointerMove}
        >
          <svg aria-hidden="true" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
            {ticks.map((value) => {
              const y = toY(value);
              return (
                <g key={value}>
                  <line
                    className="cjs-run-progress__grid-line"
                    x1={CHART_PADDING.left}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="cjs-run-progress__axis-label"
                    x={CHART_PADDING.left - 12}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {formatAxisTick(value, tickStep)}
                  </text>
                </g>
              );
            })}
            <line
              className="cjs-run-progress__grid-line cjs-run-progress__grid-line--axis"
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={PLOT_BOTTOM}
              y2={PLOT_BOTTOM}
            />
            {dedupedDateTicks.map((tick, index) => (
              <g key={tick.key}>
                <line
                  className="cjs-run-progress__grid-line"
                  x1={tick.x}
                  x2={tick.x}
                  y1={PLOT_BOTTOM}
                  y2={PLOT_BOTTOM + 6}
                />
                <text
                  className="cjs-run-progress__axis-label"
                  data-axis="date"
                  x={tick.x}
                  y={CHART_HEIGHT - 14}
                  textAnchor={
                    dedupedDateTicks.length === 1
                      ? "middle"
                      : index === 0
                        ? "start"
                        : index === dedupedDateTicks.length - 1
                          ? "end"
                          : "middle"
                  }
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {hoveredCoordinate && (
              <line
                className="cjs-run-progress__crosshair"
                x1={hoveredCoordinate.x}
                x2={hoveredCoordinate.x}
                y1={CHART_PADDING.top}
                y2={PLOT_BOTTOM}
              />
            )}
            {selectedCoordinate && (
              <line
                className="cjs-run-progress__guide"
                x1={selectedCoordinate.x}
                x2={selectedCoordinate.x}
                y1={selectedCoordinate.y}
                y2={PLOT_BOTTOM}
              />
            )}

            <path className="cjs-run-progress__line cjs-run-progress__line--best" d={bestPath} />
            <polyline
              className="cjs-run-progress__line cjs-run-progress__line--finish"
              points={runLine}
            />
            {coordinates.map(({ clipped, point, x, y }) =>
              clipped ? (
                <path
                  key={pointKey(point)}
                  className="cjs-run-progress__dot cjs-run-progress__dot--clipped"
                  d={`M${x - 6},${y + 10} L${x + 6},${y + 10} L${x},${y} Z`}
                />
              ) : (
                <circle
                  key={pointKey(point)}
                  className="cjs-run-progress__dot"
                  cx={x}
                  cy={y}
                  data-personal-best={point.isPersonalBest || undefined}
                  r={point.isPersonalBest ? 6 : 4}
                />
              ),
            )}
            {bestCoordinate && (
              <text
                className="cjs-run-progress__annotation"
                x={bestCoordinate.x}
                y={
                  bestCoordinate.y - 14 < CHART_PADDING.top
                    ? bestCoordinate.y + 22
                    : bestCoordinate.y - 14
                }
                textAnchor={
                  bestCoordinate.x > CHART_WIDTH - CHART_PADDING.right - 60
                    ? "end"
                    : bestCoordinate.x < CHART_PADDING.left + 60
                      ? "start"
                      : "middle"
                }
              >
                Best {formatRunDurationMs(bestCoordinate.point.timeMs)}
              </text>
            )}
          </svg>

          {coordinates.map(({ index, point, x, y }) => (
            <button
              key={pointKey(point)}
              className="cjs-run-progress__point"
              data-selected={
                selectedPoint !== null && pointKey(point) === pointKey(selectedPoint)
                  ? true
                  : undefined
              }
              onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
              onClick={() => onSelect(pointKey(point))}
              onFocus={() => setHoveredIndex(index)}
              onKeyDown={(event) => handlePointKeyDown(event, index)}
              style={
                {
                  "--cjs-run-x": `${(x / CHART_WIDTH) * 100}%`,
                  "--cjs-run-y": `${(y / CHART_HEIGHT) * 100}%`,
                } as CSSProperties
              }
              type="button"
              aria-label={`Run ${point.sequence}: ${formatRunDurationMs(point.timeMs)}${point.isPersonalBest ? ", personal best" : ""}`}
            />
          ))}

          {hoveredCoordinate && (
            <ChartTooltip
              coordinate={hoveredCoordinate}
              flip={hoveredCoordinate.x > CHART_WIDTH * 0.6}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ coordinate, flip }: { coordinate: ChartCoordinate; flip: boolean }) {
  const { clipped, point, x, y } = coordinate;
  return (
    <div
      aria-hidden="true"
      className="cjs-run-progress__tooltip"
      data-flip={flip || undefined}
      style={
        {
          "--cjs-run-x": `${(x / CHART_WIDTH) * 100}%`,
          "--cjs-run-y": `${(y / CHART_HEIGHT) * 100}%`,
        } as CSSProperties
      }
    >
      <p>
        Run #{point.sequence} · {formatDate(point.run.time_created)}
      </p>
      <strong>{formatRunDurationMs(point.timeMs)}</strong>
      <ul>
        <li data-series="best">
          {point.isPersonalBest
            ? point.personalBestGainMs === null
              ? "First finish"
              : `Personal best, −${formatRunDurationMs(point.personalBestGainMs)}`
            : formatBehindBest(point)}
        </li>
        {point.previousFinishDeltaMs !== null && (
          <li data-series="finish">
            {formatFinishDelta(point.previousFinishDeltaMs)} than previous
          </li>
        )}
        {clipped && <li>Slower than the visible range</li>}
      </ul>
    </div>
  );
}

function niceTicks(minimum: number, maximum: number, target = 4): number[] {
  const span = maximum - minimum;
  const fallbackStep = TICK_STEPS_MS.find((step) => step >= maximum * 0.05) ?? 1_000;
  const step =
    span <= 0
      ? fallbackStep
      : (TICK_STEPS_MS.find((candidate) => span / candidate <= target) ??
        (TICK_STEPS_MS.at(-1) ?? 3_600_000) * Math.ceil(span / (3_600_000 * target)));
  let start = Math.floor(minimum / step) * step;
  let end = Math.ceil(maximum / step) * step;
  if (start === end) {
    start = Math.max(0, start - step);
    end += step;
  }
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(value);
  return ticks;
}

function formatAxisTick(valueMs: number, stepMs: number): string {
  const label = formatRunDurationMs(valueMs);
  return stepMs >= 1_000 && label.endsWith(".00") ? label.slice(0, -3) : label;
}

function evenlySpacedTimestamps(minimum: number, maximum: number, count = 5): number[] {
  return Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1),
  );
}

function getChartDateTickIndexes(pointCount: number, maximumTicks = 5): number[] {
  if (pointCount <= 0) return [];
  if (pointCount <= maximumTicks) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }

  const lastIndex = pointCount - 1;
  return Array.from({ length: maximumTicks }, (_, index) =>
    Math.round((index / (maximumTicks - 1)) * lastIndex),
  );
}

function RunDetails({ point }: { point: RunProgressPoint }) {
  return (
    <Panel className="cjs-run-progress__details" padding="small" variant="warm" aria-live="polite">
      <div className="cjs-run-progress__details-heading">
        <span aria-hidden="true">
          <CircleGauge size={19} />
        </span>
        <div>
          <p>Selected run #{point.sequence}</p>
          <strong>{formatRunDurationMs(point.timeMs)}</strong>
        </div>
        {point.isPersonalBest && <Badge tone="success">Personal best</Badge>}
      </div>
      <dl>
        <DetailStat
          label="Recorded"
          value={point.run.time_created ? formatDate(point.run.time_created) : "Unknown"}
        />
        <DetailStat label="vs previous" value={formatFinishDelta(point.previousFinishDeltaMs)} />
        <DetailStat
          label="vs personal best"
          value={
            point.isPersonalBest
              ? point.personalBestGainMs === null
                ? "Baseline"
                : `−${formatRunDurationMs(point.personalBestGainMs)}`
              : formatBehindBest(point)
          }
        />
        <DetailStat label="Time rank" value={`#${point.run.rank}`} />
        <DetailStat label="Loads" value={formatCount(point.run.load_count)} />
        <DetailStat label="Saves" value={formatCount(point.run.save_count)} />
        <DetailStat label="Nade throws" value={formatCount(point.run.nade_throws)} />
        <DetailStat label="Nade jumps" value={formatCount(point.run.nadejumps)} />
        <DetailStat label="Run type" value={point.run.type || "Not provided"} />
        <DetailStat
          label="Run ID"
          value={point.run.run_id ? `#${point.run.run_id}` : "Not provided"}
        />
      </dl>
    </Panel>
  );
}

function SummaryStat({ hero, label, value }: { hero?: boolean; label: string; value: string }) {
  return (
    <div data-hero={hero || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function filterMaps(maps: readonly PickerMap[], query: string): PickerMap[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...maps];
  return maps.filter(
    (map) =>
      map.map_name.toLocaleLowerCase().includes(normalizedQuery) ||
      String(map.map_id).includes(normalizedQuery),
  );
}

function pickerMaps(tops: readonly TopRun[]): PickerMap[] {
  const byMap = new Map<number, PickerMap>();
  for (const run of tops) {
    const existing = byMap.get(run.cpid);
    if (existing === undefined || run.rank < existing.rank) {
      byMap.set(run.cpid, { map_id: run.cpid, map_name: run.mapname, rank: run.rank });
    }
  }
  return [...byMap.values()];
}

function formatFinishDelta(deltaMs: number | null): string {
  if (deltaMs === null) return "Baseline";
  if (deltaMs === 0) return "Same time";
  return `${formatRunDurationMs(Math.abs(deltaMs))} ${deltaMs < 0 ? "faster" : "slower"}`;
}

function formatBehindBest(point: RunProgressPoint): string {
  const behindMs = point.timeMs - point.personalBestMs;
  return behindMs === 0 ? "Matches best" : `+${formatRunDurationMs(behindMs)} behind best`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "Not provided" : new Intl.NumberFormat().format(value);
}

function pointKey(point: RunProgressPoint): number | string {
  return point.run.run_id ?? `${point.sequence}-${point.run.time_created ?? "undated"}`;
}
