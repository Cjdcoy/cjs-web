import {
  defineQuerySchema,
  integerQueryParam,
  readQueryState,
  replayPath,
  updateQuerySearch,
} from "../../lib/routing";

/** `?t=`: whole milliseconds from the replay start (the clock's 00:00), so a frame round-trips. */
const shareQuery = defineQuerySchema({ t: integerQueryParam({ min: 0 }) });

/** The shared start in ms from the replay start; 0 when `t` is missing, negative or not an integer. */
export function readReplayStartOffset(search: string): number {
  return readQueryState(search, shareQuery).t;
}

/** The replay's path starting `offsetMs` in (0: from the start), keeping the other query params. */
export function replaySharePath(runId: number, search: string, offsetMs: number): string {
  return `${replayPath(runId)}${updateQuerySearch(search, shareQuery, { t: Math.round(offsetMs) })}`;
}
