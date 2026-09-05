import { Activity, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  IconButton,
  CodPlayerName,
  EmptyState,
  ErrorState,
  Link,
  Panel,
  SkeletonGroup,
} from "../../components/ui";
import type { TopRun } from "../../lib/api";
import { formatDate, timeAgo } from "../../lib/format";
import { mapDetailPath, playerDetailPath, sourceOptions, type SourceId } from "../../lib/routing";
import { formatRunTime } from "../maps/mapDetailModel";
import { fpsLabel } from "../players/playerProfileModel";
import { useRecentRuns, type RecentRunsError } from "./useRecentRuns";
import "./recent.css";

const sourceLabels = Object.fromEntries(
  sourceOptions.map((option) => [option.value, option]),
) as Record<SourceId, (typeof sourceOptions)[number]>;

export function RecentPage() {
  const { errors, hasMore, loadMore, loading, loadingMore, reload, runs } = useRecentRuns();
  const allFailed = errors.length === sourceOptions.length;

  return (
    <section className="cjs-recent cjs-stack" aria-labelledby="recent-title">
      <header className="cjs-recent__hero cjs-page-heading">
        <div className="cjs-recent__eyebrow cjs-page-heading__eyebrow">
          <Activity size={18} aria-hidden="true" />
          <span>Latest activity</span>
        </div>
        <h1 id="recent-title">Recent updates</h1>
        <p className="cjs-page-heading__description">
          A chronological feed of the newest finished runs across JumpersHeaven and Jump4Life.
        </p>
      </header>

      <div className="cjs-recent__toolbar">
        <IconButton
          label={loading ? "Refreshing" : "Refresh"}
          variant="ghost"
          size="small"
          onClick={reload}
          isLoading={loading}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </IconButton>
      </div>

      {loading && runs.length === 0 && (
        <Panel>
          <SkeletonGroup count={6} label="Loading recent updates" />
        </Panel>
      )}

      {allFailed && runs.length === 0 && !loading && (
        <ErrorState
          title="Recent updates unavailable"
          description={describe(errors)}
          onRetry={reload}
        />
      )}

      {errors.length > 0 && !(allFailed && runs.length === 0) && (
        <div className="cjs-recent__inline-error" role="alert">
          <span>{describe(errors)} The remaining updates are still listed.</span>
          <Button variant="ghost" size="small" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {!loading && errors.length === 0 && runs.length === 0 && (
        <EmptyState
          title="No recent updates"
          description="Neither JumpersHeaven nor Jump4Life returned a finished run yet."
        />
      )}

      {runs.length > 0 && (
        <>
          <ol className="cjs-recent__list" aria-label="Recent updates">
            {runs.map(({ run, source }) => (
              <li className="cjs-recent__row" key={`${source}-${run.run_id}-${run.cpid}`}>
                <p className="cjs-recent__sentence">
                  <Link href={playerDetailPath(run.player_id, source)} variant="player">
                    <CodPlayerName value={run.playername} />
                  </Link>{" "}
                  finished{" "}
                  <Link href={mapDetailPath(run.cpid, { lookup: "cpid", source })}>
                    {run.mapname}
                  </Link>
                  {run.ender ? ` · ${run.ender}` : ""} in <strong>{formatRunTime(run)}</strong>
                </p>
                <p className="cjs-recent__meta">
                  <Badge>{sourceLabels[source].shortLabel}</Badge>
                  <Badge>{fpsLabel(run.fps)}</Badge>
                  {run.rank > 0 && <Badge tone={rankTone(run.rank)}>{rankLabel(run)}</Badge>}
                </p>
                <time
                  className="cjs-recent__when"
                  dateTime={run.time_created}
                  title={formatDate(run.time_created)}
                >
                  {timeAgo(run.time_created)}
                </time>
              </li>
            ))}
          </ol>

          {hasMore && (
            <div className="cjs-recent__load-more">
              <Button variant="secondary" isLoading={loadingMore} onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function describe(errors: readonly RecentRunsError[]): string {
  return errors
    .map(({ message, source }) => `${sourceLabels[source].label} is unavailable: ${message}`)
    .join(" ");
}

function rankLabel(run: TopRun): string {
  if (run.rank === 1) return "World record";
  if (run.rank <= 10) return `Top 10 · #${run.rank}`;
  return `#${run.rank} of ${run.totalNr ?? 0}`;
}

function rankTone(rank: number): "success" | "information" | "neutral" {
  if (rank === 1) return "success";
  return rank <= 10 ? "information" : "neutral";
}
