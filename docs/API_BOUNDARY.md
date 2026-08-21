# CJS API boundary

Feature code must consume `src/lib/api/index.ts`. Do not call `fetch` directly,
construct API URLs in a view, or cast response JSON in a component. The legacy
`src/api.ts` module is only a compatibility facade for the scrapped UI and may be
removed after those screens migrate.

## Public usage

The singleton `api` uses `VITE_API_BASE_URL` when configured and otherwise calls
`https://api.jump4life.org`. Tests and alternate environments can compose their
own instance with `createJsonClient` and `createCjsApi`.

```ts
import { api, supportsCapability } from "../lib/api";

const maps = await api.maps({ source: "jh", signal });

if (supportsCapability("player-rank", source)) {
  const rank = await api.playerRank({ source, playerId, signal });
}
```

Every request takes an object with typed parameters plus optional `signal` and
`onRetry`. UI code can use `onRetry` to show retry state rather than silently
hiding a transient upstream failure.

## Capability matrix

| Capability                           | JH  | J4L | Game |
| ------------------------------------ | --- | --- | ---- |
| Tracker, leaderboards, maps, players | Yes | Yes | COD2 |
| Player rank and rank-XP leaderboard  | No  | Yes | COD2 |
| Player activity summary              | No  | Yes | COD2 |

COD4 is intentionally absent until the backend documents a source/game contract
and representative payloads exist. Unsupported combinations throw
`UnsupportedCapabilityError` before the JSON client is called.

## Failure and retry policy

- `ApiError` reports a stable kind, endpoint path, status when available,
  attempt count, and retryability. Error messages never include query values or
  response bodies.
- Cancellation is a structured `aborted` error and never retries.
- Safe GET requests retry only network failures and status 408, 429, 500, 502,
  503, or 504. The default is one retry and configuration is capped at three.
- Ordinary 4xx responses, malformed JSON, and malformed response shapes never
  retry.

## Contract and fixture policy

All transport data enters the application as `unknown` and is normalized once in
`normalizers.ts`. Required identity fields fail with a safe `invalid-response`
error; explicitly optional aggregates receive documented defaults. Contract
tests use only anonymized fixtures under `src/lib/api/__fixtures__` and never
depend on the live service.

The boundary accounts for known differences between the current OpenAPI file and
live payloads:

- Tracker responses have a loose documented schema.
- Map documentation uses `map_id`, while current list payloads use `mapid` and
  `cp_id`; both forms normalize to one model.
- Embedded J4L activity summaries may omit first/last activity timestamps even
  though the standalone schema lists them.

When adding an endpoint, add its literal capability, typed input/output,
normalizer, anonymized fixture, exact URL assertion, malformed-payload assertion,
and then export it from the stable index.
