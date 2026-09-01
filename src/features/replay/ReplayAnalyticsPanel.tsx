import {
  Button,
  CodPlayerName,
  DataTable,
  Link,
  Panel,
  SkeletonGroup,
  VisuallyHidden,
  type DataTableColumn,
} from "../../components/ui";
import type {
  ReplayWatchAggregate,
  ReplayWatchRankingEntry,
  ReplayWatchScope,
  Source,
} from "../../lib/api";
import { mapDetailPath, playerDetailPath } from "../../lib/routing";
import { useReplayAnalytics, type ReplayAnalyticsApi } from "./useReplayAnalytics";

export function ReplayAnalyticsPanel({
  apiClient,
  scope,
  source,
}: {
  apiClient?: ReplayAnalyticsApi;
  scope: ReplayWatchScope;
  source: Source;
}) {
  const resources = useReplayAnalytics({ apiClient, scope, source });
  const isPlayer = "ownerPlayerId" in scope;
  const isRefreshing = [resources.aggregate, resources.rankings].some(
    (resource) => resource.status === "refreshing",
  );
  const isAggregateLoading =
    resources.aggregate.status === "loading" && resources.aggregate.data === null;
  const isRankingsLoading =
    resources.rankings.status === "loading" && resources.rankings.data === null;
  const isLoading = [resources.aggregate, resources.rankings].some(
    (resource) => resource.status === "loading" && resource.data === null,
  );
  const loadingLabel =
    isAggregateLoading && isRankingsLoading
      ? "Loading replay analytics"
      : isAggregateLoading
        ? "Loading replay audience totals"
        : "Loading most viewed runs";
  const errors = [resources.aggregate, resources.rankings].filter(
    (resource) => resource.status === "error",
  );
  const hasStaleData = errors.some((resource) => resource.data !== null);
  const aggregate = resources.aggregate.data;
  const rankings = resources.rankings.data;
  const topRanking = rankings?.[0] ?? null;
  const isEmpty =
    aggregate?.watch_count === 0 &&
    aggregate.replay_count === 0 &&
    rankings !== null &&
    rankings.length === 0;
  const columns = createReplayColumns(source);
  const headingId = isPlayer ? "player-replay-reach" : "map-replay-activity";

  if (source !== "j4l") return null;

  return (
    <section
      className="cjs-replay-analytics cjs-stack"
      data-scope={isPlayer ? "player" : "map"}
      aria-labelledby={headingId}
    >
      <Panel className="cjs-replay-analytics__panel cjs-stack" padding="small">
        <div className="cjs-replay-analytics__header cjs-cluster">
          <div>
            {isPlayer && <strong>Jump4Life replay analytics</strong>}
            <h2 id={headingId}>{isPlayer ? "Replay reach" : "In-game Replay views"}</h2>
            {isPlayer && (
              <p className="cjs-replay-analytics__description">
                Audience totals across this player&apos;s watched replays.
              </p>
            )}
          </div>
          {isPlayer && (
            <Button
              isLoading={isRefreshing}
              loadingLabel="Refreshing replay analytics"
              onClick={resources.reload}
              size="small"
              variant="ghost"
            >
              Refresh replay analytics
            </Button>
          )}
        </div>

        <VisuallyHidden aria-live="polite">
          {isRefreshing
            ? "Refreshing replay analytics. Previous results remain available."
            : hasStaleData
              ? "Replay analytics refresh failed. Previous results remain available."
              : ""}
        </VisuallyHidden>

        {isLoading && <SkeletonGroup count={4} label={loadingLabel} variant="card" />}

        {errors.length > 0 && (
          <div className="cjs-stack" role="alert">
            <div>
              <strong>
                {errors.length === 2
                  ? "Replay analytics are unavailable."
                  : "Some replay analytics are unavailable."}
              </strong>
              <span>
                {hasStaleData
                  ? " Earlier results remain visible."
                  : " The rest of this page remains available."}
              </span>
            </div>
            <Button size="small" variant="secondary" onClick={resources.reload}>
              Retry replay analytics
            </Button>
          </div>
        )}

        {isEmpty && (
          <div className="cjs-state">
            <h3 className="cjs-state__title">No replay audience yet</h3>
            <p className="cjs-state__description">
              {isPlayer
                ? "This player's replays have no recorded watches yet."
                : "No replays on this map have recorded watches yet."}
            </p>
          </div>
        )}

        {aggregate && !isEmpty && <ReplaySummary aggregate={aggregate} playerScope={isPlayer} />}

        {rankings && rankings.length > 0 && isPlayer && (
          <div className="cjs-stack">
            <div>
              <h3>Most viewed runs</h3>
              <p>Ranked by completed and partial replay watches.</p>
            </div>
            <DataTable
              caption="Most viewed runs by this player"
              columns={columns}
              rows={rankings}
              getRowKey={(entry) => entry.run_id}
              getRowLabel={(entry) => `Replay rank ${entry.rank}, run ${entry.run_id}`}
            />
          </div>
        )}

        {topRanking && !isPlayer && <CompactReplayRanking entry={topRanking} source={source} />}
      </Panel>
    </section>
  );
}

function ReplaySummary({
  aggregate,
  playerScope,
}: {
  aggregate: ReplayWatchAggregate;
  playerScope: boolean;
}) {
  return (
    <div className="cjs-stack">
      <dl
        className={playerScope ? "cjs-grid" : "cjs-replay-analytics__map-summary"}
        aria-label="Replay audience summary"
      >
        <ReplayStat
          label={playerScope ? "Watched replays" : "Replays viewed"}
          value={formatNumber(aggregate.replay_count)}
        />
        <ReplayStat
          label={playerScope ? "Watches" : "Total views"}
          value={formatNumber(aggregate.watch_count)}
        />
        <ReplayStat
          label={playerScope ? "Distinct viewers" : "Viewers"}
          value={formatNumber(aggregate.unique_viewer_count)}
        />
        <ReplayStat
          label={playerScope ? "Watch time" : "Time watched"}
          value={formatWatchTime(aggregate.total_watch_ms)}
        />
      </dl>
      {!aggregate.last_watched_at && <p>No watch activity has been recorded yet.</p>}
    </div>
  );
}

function ReplayStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CompactReplayRanking({
  entry,
  source,
}: {
  entry: ReplayWatchRankingEntry;
  source: Source;
}) {
  return (
    <div className="cjs-replay-analytics__map-highlight">
      <p>Most watched replay</p>
      <div>
        <Link href={playerDetailPath(entry.owner_player_id, source)} variant="player">
          <CodPlayerName value={entry.owner_playername || `Player #${entry.owner_player_id}`} />
        </Link>
        <strong>
          {formatNumber(entry.watch_count)} {entry.watch_count === 1 ? "view" : "views"}
        </strong>
      </div>
      <span>
        {formatNumber(entry.unique_viewer_count)}{" "}
        {entry.unique_viewer_count === 1 ? "viewer" : "viewers"}
        {" · "}
        {formatWatchTime(entry.total_watch_ms)} watched
        {" · "}
        Run #{entry.run_id}
        {entry.fps ? ` · ${entry.fps === "0" ? "mixed" : entry.fps} FPS` : ""}
      </span>
    </div>
  );
}

function createReplayColumns(source: Source): readonly DataTableColumn<ReplayWatchRankingEntry>[] {
  return [
    {
      id: "rank",
      header: "Rank",
      priority: "primary" as const,
      cell: (entry: ReplayWatchRankingEntry) => <strong>#{entry.rank}</strong>,
    },
    {
      id: "replay",
      header: "Map",
      priority: "primary" as const,
      cell: (entry: ReplayWatchRankingEntry) => (
        <Link href={mapDetailPath(entry.mapid, { source })} variant="standalone">
          {entry.mapname || `Map #${entry.mapid}`}
        </Link>
      ),
    },
    {
      id: "watches",
      header: "Watches",
      cell: (entry: ReplayWatchRankingEntry) => formatNumber(entry.watch_count),
    },
    {
      id: "viewers",
      header: "Viewers",
      cell: (entry: ReplayWatchRankingEntry) => formatNumber(entry.unique_viewer_count),
    },
    {
      id: "watch-time",
      header: "Watch time",
      cell: (entry: ReplayWatchRankingEntry) => formatWatchTime(entry.total_watch_ms),
    },
  ];
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatWatchTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${formatNumber(hours)}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${seconds}s`;
}
