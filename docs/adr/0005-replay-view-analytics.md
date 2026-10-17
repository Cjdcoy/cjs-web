# ADR 0005: Anonymous web replay-view analytics

- **Status:** accepted
- **Date:** 2026-10-17

## Context

In-game replay watches are already recorded (`run_replay_watch_*`) and shown in the replay
analytics panels. The owner wants the same insight for replays watched on this site: how many
people play a replay, which parts they watch, and how they use the player. This is the first time
the site sends data to the API instead of only reading it, so AGENTS.md requires an ADR. The
approved design (`replay-web-analytics.md` in the shared web-assets design folder) fixes the
payload, the endpoints, and the storage, and the backend's `api-contract.md` beside it pins the
read shapes; the backend and the J4L database are covered there.

## Decision

- **Collection.** A view is one mount of the replay player from its first Play. The pure,
  unit-tested `src/features/replayPlayer/replayViewTracker.ts` holds the state. `useReplayPlayback`
  reports what played through optional `onSegment(fromT, toT, wallMs, speed)` and
  `onSeek(from, to)` callbacks, and exposes `flushSegment()`. Only stretches played while the tab
  is visible count: hiding the tab closes the segment, and showing it re-anchors the segment
  without reporting the hidden time. Seeks under 500 ms apart (one slider drag) count once.
- **Payload.** `v: 1` JSON as in the design: `view_id`, `run_id`, `seq`, `duration_ms`,
  `speed_ms[5]`, merged `watched` ranges (at most 64, smallest gaps joined above that), `played`
  segments since the last flush (at most 64), `max_pos_ms`, `seeks`, the 10 largest `top_seeks`,
  `auto_skip`, `skipped_fails`, `cinema`, `fullscreen`, `entry`, and `device`. Counters are
  cumulative and `seq` increases, so a repeated or lost beacon is harmless.
- **Sending.** `navigator.sendBeacon` to `POST {replay API}/api/v1/replay/views` as `text/plain`
  (a CORS simple request, no preflight), falling back to a `keepalive`, `no-cors` fetch. Flushes
  run every 30 s while something changed, when the tab hides, on `pagehide`, and on unmount
  (in-app navigation fires no `pagehide`). Nothing is sent before 5 s of real playback. The
  response is never read and nothing about the request is logged.
- **Privacy.** No cookies or storage. The `view_id` is 128 random bits held in memory for one page
  view. `entry` comes from the previous in-app route, recorded by the router in a module variable
  (`map`, `recent`, `player`, `direct`, or `other`); `document.referrer` and external URLs are
  never sent. `device` is only `mobile` or `desktop` from one media query. Browsers that send Do
  Not Track (`doNotTrack === "1"`) or Global Privacy Control are never counted. The owner chose
  not to add the About-page privacy text for now.
- **Gating.** Everything (collection, view counts, heat strip, and the panel's In-game | Web
  control) is off unless the build sets `VITE_REPLAY_VIEW_ANALYTICS=1`. CI and deploy builds read
  the repository variable of the same name; unset keeps the site as before. The backend has its
  own switch, and the tables are inert without writers.
- **Reading.** The API layer adds `replayWebViewSummary` (only its `heat` is used),
  `replayWebViewAggregate` (the in-game aggregate shape plus `avg_completion`),
  `replayWebViewRankings` (the in-game ranking shape), and `replayViewCounts`
  (`{run_id: {web, in_game}}`, up to 100 runs), all validated and cancellable like the other
  endpoints. Web counts are viewer-days, and the country breakdown is never shown per run.
- **UI.** The replay page shows "N web views · M in-game" beside the duration. The timeline draws
  the watch heat as one CSS gradient of at most 200 downsampled bands in the marker lane, with a
  spoken "Most watched" line and a remembered "Watch heat" HUD toggle (`hudPreferences` stays
  version 1; the new field takes its default). The map and player replay panels get an
  In-game | Web control; the web side shows views, viewer-days, average completion, and the most
  watched run.

## Consequences

The site now writes anonymous usage data to the J4L API when the flag is on. The flag is a
build-time kill switch, and the backend switch can stop writes without a frontend release. The
player remounts per run so that each run is its own view. The API client now looks up
`globalThis.fetch` on each request instead of binding it at load, which lets test mocks installed
after import intercept the shared client; production behaviour is unchanged. No new runtime
dependency is added. The collector, read hooks, heat strip, and endpoints add about 4 KiB gzip
across the replay, panel, and API chunks, so the total JavaScript budget rises narrowly from 151 to
155 KiB (measured at 154.0 KiB); the initial and route budgets are unchanged (69.7/75 and
35.8/36 KiB). The flag helpers are imported from `lib/api/replayViews` directly rather than through
the `lib/api` barrel, which otherwise made the bundler split the shared UI kit out of the entry
chunk.

The read shapes follow the backend's final contract (`api-contract.md` beside the design): web
aggregates and rankings reuse the in-game shapes, the summary's `heat` is dense per 5 s bucket,
and `view-counts` lists every requested run. Payload numbers are integers, `seeks` and
`skipped_fails` are capped at 65535, and the first flush carries at most about 35 s of playback,
within the 60 s the API allows for a new view. Countries appear only in map or site-wide
aggregates and are not shown by the site yet.
