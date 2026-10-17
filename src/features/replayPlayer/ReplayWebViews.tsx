import { useMemo, type CSSProperties } from "react";
import { Badge, VisuallyHidden } from "../../components/ui";
import type { ReplayWebViewHeat } from "../../lib/api";
import { formatHeatClock, heatGradient, heatStops, mostWatched } from "./replayHeat";
import { useReplayViewCounts, type ReplayWebViewsApi } from "./useReplayWebViews";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** "1.2K web views · 340 in-game" beside the duration badge. */
export function ReplayViewCountBadge({
  apiClient,
  runId,
}: {
  apiClient?: ReplayWebViewsApi;
  runId: number;
}) {
  const { data, enabled, error, loading } = useReplayViewCounts(runId, apiClient);
  if (!enabled) return null;
  if (loading && !data) return <Badge aria-busy="true">Loading views…</Badge>;
  if (error || !data) return <Badge tone="warning">Views unavailable</Badge>;
  if (data.web === 0 && data.in_game === 0) return <Badge>No views yet</Badge>;
  return (
    <Badge>
      {compact.format(data.web)} web {data.web === 1 ? "view" : "views"} ·{" "}
      {compact.format(data.in_game)} in-game
    </Badge>
  );
}

/**
 * The most watched parts of the replay as one gradient band on the timeline. Purely visual; the
 * hottest stretch is also spoken.
 */
export function ReplayHeatStrip({ heat, span }: { heat: ReplayWebViewHeat; span: number }) {
  const stops = useMemo(() => heatStops(heat, span), [heat, span]);
  const hottest = useMemo(() => mostWatched(heat, span), [heat, span]);
  if (stops.length === 0 || !hottest) return null;
  return (
    <>
      <div
        className="cjs-replay-player__heat"
        aria-hidden="true"
        style={{ "--cjs-replay-heat": heatGradient(stops) } as CSSProperties}
      />
      <VisuallyHidden>
        Most watched: {formatHeatClock(hottest.start)}–{formatHeatClock(hottest.end)}
      </VisuallyHidden>
    </>
  );
}
