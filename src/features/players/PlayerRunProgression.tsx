import { ChartNoAxesCombined, CircleGauge, ListChecks, Search } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  Select,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import type { Fps, PlayerJumpScores, PlayerMapScore, TopRun } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { fpsLabel } from "./playerProfileModel";
import {
  createRunProgression,
  formatRunDurationMs,
  type RunProgressPoint,
} from "./runProgressionModel";
import type { ProfileResource } from "./usePlayerProfile";

interface PlayerRunProgressionProps {
  fps: Fps;
  mapId: number;
  onMapChange: (mapId: number) => void;
  onRetry: () => void;
  runs: ProfileResource<TopRun[]>;
  scores: ProfileResource<PlayerJumpScores>;
}

export function PlayerRunProgression({
  fps,
  mapId,
  onMapChange,
  onRetry,
  runs,
  scores,
}: PlayerRunProgressionProps) {
  const [mapFilter, setMapFilter] = useState("");
  const maps = useMemo(() => scores.data?.map_scores ?? [], [scores.data]);
  const filteredMaps = useMemo(() => filterMaps(maps, mapFilter), [mapFilter, maps]);
  const selectedMap = maps.find((map) => map.map_id === mapId) ?? null;
  const displayedMaps =
    selectedMap && !filteredMaps.some((map) => map.map_id === selectedMap.map_id)
      ? [selectedMap, ...filteredMaps]
      : filteredMaps;

  if (scores.status === "loading" && mapId === 0) {
    return <SkeletonGroup count={5} label="Loading analytics maps" />;
  }

  if (scores.status === "error" && scores.data === null && mapId === 0) {
    return (
      <ErrorState
        description="The map list could not be loaded, so run analytics cannot be selected yet."
        onRetry={onRetry}
        title="Analytics maps unavailable"
      />
    );
  }

  if (maps.length === 0 && mapId === 0) {
    return (
      <EmptyState
        description={`No ranked ${fpsLabel(fps)} maps are published for this player. Try another FPS.`}
        title="No maps to chart"
      />
    );
  }

  return (
    <div className="cjs-run-progress">
      {mapId === 0 ? (
        <>
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
          <EmptyState
            description="Choose a map to compare every recorded finish in chronological order."
            title="Pick a map"
          />
        </>
      ) : (
        <RunHistory
          controls={
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
          }
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
  displayedMaps: readonly PlayerMapScore[];
  filteredCount: number;
  fps: Fps;
  mapFilter: string;
  mapId: number;
  onFilterChange: (value: string) => void;
  onMapChange: (mapId: number) => void;
  selectedMap: PlayerMapScore | null;
  totalCount: number;
}) {
  return (
    <Panel className="cjs-run-progress__map-picker" padding="small" variant="strong">
      <Input
        label="Find a ranked map"
        leading={<Search size={17} />}
        onChange={(event) => onFilterChange(event.currentTarget.value)}
        placeholder="Search map name"
        type="search"
        value={mapFilter}
      />
      <Select
        helperText={`${filteredCount} of ${totalCount} ranked maps shown at ${fpsLabel(fps)}.`}
        id="player-progress-map"
        label="Map"
        onChange={(event) => onMapChange(Number(event.currentTarget.value))}
        value={mapId || ""}
      >
        <option value="" disabled>
          Select a map
        </option>
        {mapId > 0 && !selectedMap && <option value={mapId}>Map #{mapId}</option>}
        {displayedMaps.map((map) => (
          <option key={map.map_id} value={map.map_id}>
            {map.map_name} · #{map.rank}
          </option>
        ))}
      </Select>
    </Panel>
  );
}

function RunHistory({
  controls,
  mapName,
  onRetry,
  resource,
}: {
  controls: ReactNode;
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
    return (
      <div className="cjs-run-progress__state-layout">
        <div>{controls}</div>
        <SkeletonGroup count={7} label={`Loading ${mapName} run analytics`} />
      </div>
    );
  }

  if (resource.status === "error" && resource.data === null) {
    return (
      <div className="cjs-run-progress__state-layout">
        <div>{controls}</div>
        <ErrorState
          description={`The recorded finishes for ${mapName} could not be loaded.`}
          onRetry={onRetry}
          title="Run analytics unavailable"
        />
      </div>
    );
  }

  if (!progression.summary) {
    return (
      <div className="cjs-run-progress__state-layout">
        <div>{controls}</div>
        <EmptyState
          description="This map has no recorded finishes for the selected player and FPS."
          title="No run history yet"
        />
      </div>
    );
  }

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
          "—"
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

      <div className="cjs-run-progress__analytics">
        <div className="cjs-run-progress__analytics-controls">{controls}</div>

        <RunProgressChart
          onSelect={setSelectedKey}
          points={progression.points}
          selectedPoint={selectedPoint}
        />

        {selectedPoint && <RunDetails point={selectedPoint} />}
      </div>

      <div className="cjs-run-progress__ledger">
        <div className="cjs-run-progress__ledger-headings">
          <div className="cjs-run-progress__ledger-heading">
            <span aria-hidden="true">
              <ChartNoAxesCombined size={20} />
            </span>
            <div>
              <h2 id="run-progress-title">{mapName} progression</h2>
              <p>Every finish in recorded order, with personal-best gains tracked over time.</p>
            </div>
          </div>
          <div className="cjs-run-progress__ledger-heading">
            <span aria-hidden="true">
              <ListChecks size={19} />
            </span>
            <div>
              <h3>Run-by-run improvement</h3>
              <p>The table is the complete text alternative to the chart.</p>
            </div>
          </div>
        </div>

        <dl className="cjs-run-progress__summary" aria-label="Run improvement summary">
          <SummaryStat label="Finishes" value={String(progression.summary.runCount)} />
          <SummaryStat
            label="Best time"
            value={formatRunDurationMs(progression.summary.bestTimeMs)}
          />
          <SummaryStat
            label="Total improvement"
            value={`${formatRunDurationMs(progression.summary.improvementMs)} · ${Math.round(progression.summary.improvementPercent * 100)}%`}
          />
          <SummaryStat
            label="PB improvements"
            value={String(progression.summary.personalBestCount)}
          />
          <SummaryStat
            label="Biggest leap"
            value={formatRunDurationMs(progression.summary.biggestGainMs)}
          />
          <SummaryStat
            label="Median finish"
            value={formatRunDurationMs(progression.summary.medianTimeMs)}
          />
        </dl>

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

function RunProgressChart({
  onSelect,
  points,
  selectedPoint,
}: {
  onSelect: (key: number | string) => void;
  points: readonly RunProgressPoint[];
  selectedPoint: RunProgressPoint | null;
}) {
  const width = 800;
  const height = 340;
  const padding = { bottom: 64, left: 72, right: 28, top: 28 };
  const times = points.map((point) => point.timeMs);
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  const sameTime = maximum === minimum;
  const span = sameTime ? Math.max(maximum * 0.08, 1) : maximum - minimum;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    point,
    x:
      padding.left +
      (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: sameTime
      ? padding.top + plotHeight / 2
      : padding.top + ((maximum - point.timeMs) / span) * plotHeight,
    bestY: sameTime
      ? padding.top + plotHeight / 2
      : padding.top + ((maximum - point.personalBestMs) / span) * plotHeight,
  }));
  const runLine = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const bestLine = coordinates.map(({ bestY, x }) => `${x},${bestY}`).join(" ");
  const dateTickIndexes = getChartDateTickIndexes(points.length);
  const plotBottom = padding.top + plotHeight;

  return (
    <div className="cjs-run-progress__chart-block">
      <div className="cjs-run-progress__chart-heading">
        <div>
          <h2>Finish-time trend</h2>
          <p id="run-progress-chart-help">
            Lower points are faster. Select a finish to inspect it.
          </p>
        </div>
        <div className="cjs-run-progress__legend" aria-hidden="true">
          <span data-series="finish">Finish</span>
          <span data-series="best">Personal best</span>
        </div>
      </div>
      <div
        className="cjs-run-progress__chart"
        role="group"
        aria-describedby="run-progress-chart-help"
        aria-label="Interactive finish-time chart"
      >
        <div className="cjs-run-progress__chart-canvas">
          <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`}>
            {(sameTime ? [0.5] : [0, 0.25, 0.5, 0.75, 1]).map((ratio) => {
              const y = padding.top + ratio * plotHeight;
              const value = sameTime ? minimum : maximum - ratio * span;
              return (
                <g key={ratio}>
                  <line
                    className="cjs-run-progress__grid-line"
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="cjs-run-progress__axis-label"
                    x={padding.left - 12}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {formatRunDurationMs(value)}
                  </text>
                </g>
              );
            })}
            <line
              className="cjs-run-progress__grid-line"
              x1={padding.left}
              x2={width - padding.right}
              y1={plotBottom}
              y2={plotBottom}
            />
            {dateTickIndexes.map((index) => {
              const coordinate = coordinates[index];
              if (!coordinate) return null;

              const textAnchor =
                points.length === 1
                  ? "middle"
                  : index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle";

              return (
                <g key={`date-${pointKey(coordinate.point)}`}>
                  <line
                    className="cjs-run-progress__grid-line"
                    x1={coordinate.x}
                    x2={coordinate.x}
                    y1={plotBottom}
                    y2={plotBottom + 6}
                  />
                  <text
                    className="cjs-run-progress__axis-label"
                    data-axis="date"
                    style={{
                      fill: "var(--cjs-color-text)",
                      fontSize: "var(--cjs-font-size-sm)",
                      fontWeight: "var(--cjs-font-weight-medium)",
                    }}
                    x={coordinate.x}
                    y={height - 14}
                    textAnchor={textAnchor}
                  >
                    {formatDate(coordinate.point.run.time_created)}
                  </text>
                </g>
              );
            })}
            <polyline
              className="cjs-run-progress__line cjs-run-progress__line--finish"
              points={runLine}
            />
            <polyline
              className="cjs-run-progress__line cjs-run-progress__line--best"
              points={bestLine}
            />
            {coordinates.map(({ point, x, y }) => (
              <circle
                key={pointKey(point)}
                className="cjs-run-progress__dot"
                cx={x}
                cy={y}
                data-personal-best={point.isPersonalBest || undefined}
                r={point.isPersonalBest ? 6 : 4}
              />
            ))}
          </svg>
          {coordinates.map(({ point, x, y }) => (
            <button
              key={pointKey(point)}
              className="cjs-run-progress__point"
              data-selected={
                selectedPoint !== null && pointKey(point) === pointKey(selectedPoint)
                  ? true
                  : undefined
              }
              onClick={() => onSelect(pointKey(point))}
              style={
                {
                  "--cjs-run-x": `${(x / width) * 100}%`,
                  "--cjs-run-y": `${(y / height) * 100}%`,
                } as CSSProperties
              }
              type="button"
              aria-label={`Run ${point.sequence}: ${formatRunDurationMs(point.timeMs)}${point.isPersonalBest ? ", personal best" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
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
        <DetailStat
          label="Run ID"
          value={point.run.run_id ? `#${point.run.run_id}` : "Not provided"}
        />
        <DetailStat label="Time rank" value={`#${point.run.rank}`} />
        <DetailStat label="Loads" value={formatCount(point.run.load_count)} />
        <DetailStat label="Saves" value={formatCount(point.run.save_count)} />
        <DetailStat label="Nade throws" value={formatCount(point.run.nade_throws)} />
        <DetailStat label="Nade jumps" value={formatCount(point.run.nadejumps)} />
        <DetailStat label="Run type" value={point.run.type || "Not provided"} />
      </dl>
    </Panel>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
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

function filterMaps(maps: readonly PlayerMapScore[], query: string): PlayerMapScore[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...maps];
  return maps.filter(
    (map) =>
      map.map_name.toLocaleLowerCase().includes(normalizedQuery) ||
      String(map.map_id).includes(normalizedQuery),
  );
}

function formatFinishDelta(deltaMs: number | null): string {
  if (deltaMs === null) return "Baseline";
  if (deltaMs === 0) return "Same time";
  return `${formatRunDurationMs(Math.abs(deltaMs))} ${deltaMs < 0 ? "faster" : "slower"}`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "Not provided" : new Intl.NumberFormat().format(value);
}

function pointKey(point: RunProgressPoint): number | string {
  return point.run.run_id ?? `${point.sequence}-${point.run.time_created ?? "undated"}`;
}
