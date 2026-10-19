import { Clapperboard, FileWarning, Film } from "lucide-react";
import {
  Badge,
  CodPlayerName,
  EmptyState,
  ErrorState,
  Link,
  SkeletonGroup,
} from "../../components/ui";
import { getMapModelUrl, hasMapModels } from "../../lib/mapModels";
import { appPaths, playerDetailPath } from "../../lib/routing";
import { formatReplayClock } from "./replayPlayback";
import { ReplayPlayer } from "./ReplayPlayer";
import { ReplayViewCountBadge } from "./ReplayWebViews";
import { useReplaySamples, type ReplaySamplesApi } from "./useReplaySamples";
import "./replayPlayer.css";

export function ReplayPage({ apiClient, runId }: { apiClient?: ReplaySamplesApi; runId: string }) {
  const id = parseRunId(runId);

  return (
    <div className="cjs-replay-page cjs-stack">
      <header className="cjs-page-heading">
        <div className="cjs-page-heading__eyebrow">
          <Clapperboard size={18} aria-hidden="true" />
          <span>Jump4Life replay</span>
        </div>
        <h1>Replay of run {id === null ? runId : `#${id}`}</h1>
      </header>

      {!hasMapModels() ? (
        <EmptyState
          icon={Film}
          title="3D replays are not available"
          description="This site is not configured with 3D map models, so replays cannot be shown."
          action={
            <Link href={appPaths.recent} variant="standalone">
              Browse recent runs
            </Link>
          }
        />
      ) : id !== null ? (
        <ReplayContent apiClient={apiClient} runId={id} />
      ) : (
        <EmptyState
          icon={Film}
          title="Replay not found"
          description="This replay link does not contain a valid run number."
        />
      )}
    </div>
  );
}

function ReplayContent({ apiClient, runId }: { apiClient?: ReplaySamplesApi; runId: number }) {
  const { data, error, loading, reload } = useReplaySamples(runId, apiClient);

  if (loading && !data) return <SkeletonGroup count={4} label="Loading replay" variant="card" />;
  if (error) {
    return (
      <ErrorState
        title="Replay could not be loaded"
        description={error}
        onRetry={reload}
        retryLabel="Retry loading the replay"
      />
    );
  }
  if (!data || data.kind === "unavailable") {
    return (
      <EmptyState
        icon={Film}
        title="Replay not available"
        description={`Run #${runId} has no archived replay yet. Only Jump4Life runs are recorded, and new runs can take a while to be archived.`}
      />
    );
  }
  if (data.kind === "unsupported") {
    return (
      <EmptyState
        icon={FileWarning}
        title="Replay format not supported"
        description="This replay was recorded in a format the viewer cannot play yet."
      />
    );
  }

  const { samples } = data;
  const modelUrl = getMapModelUrl(samples.mapname);
  return (
    <>
      <div className="cjs-replay-page__summary">
        <Link href={playerDetailPath(samples.player_id, "j4l")} variant="player">
          <CodPlayerName value={samples.playername} />
        </Link>
        <span>
          on{" "}
          <Link href={`${appPaths.maps}?source=j4l&q=${encodeURIComponent(samples.mapname)}`}>
            {samples.mapname}
          </Link>
        </span>
        <Badge>{formatReplayClock(samples.t[samples.t.length - 1] ?? 0)}</Badge>
        <ReplayViewCountBadge runId={samples.run_id} />
        <Badge tone={samples.finished ? "success" : "neutral"}>
          {samples.finished ? "Finished run" : "Unfinished run"}
        </Badge>
      </div>
      {samples.t.length < 2 || !modelUrl ? (
        <EmptyState
          icon={Film}
          title="Replay has no movement"
          description="The archived replay does not contain enough samples to play back."
        />
      ) : (
        // A new run is a new view: remount so playback and view analytics start over.
        <ReplayPlayer key={samples.run_id} modelUrl={modelUrl} samples={samples} />
      )}
    </>
  );
}

function parseRunId(value: string): number | null {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
