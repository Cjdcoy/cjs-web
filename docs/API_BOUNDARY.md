# CJS API boundary

Feature code must consume `src/lib/api/index.ts`. Do not call `fetch` directly,
construct API URLs in a view, or cast response JSON in a component. The legacy
`src/api.ts` module is only a compatibility facade for the scrapped UI and may be
removed after those screens migrate.

## Public usage

The singleton `api` uses `VITE_API_BASE_URL` when configured and otherwise calls
`https://api.jump4life.org`. Tests and alternate environments can compose their
own instance with `createJsonClient` and `createCjsApi`.

The default transport remains legacy `/api/v1` JSON. Set `VITE_API_FORMAT=json` for `/api/v2`
compact JSON or `VITE_API_FORMAT=msgpack` for `/api/v2` MessagePack. The selected API base must run
the v2 backend first; selecting either v2 format against a v1-only backend returns 404.
For CI deployments, set the GitHub repository variable `VITE_API_FORMAT`; CI embeds it in the
production bundle and includes it in the build-cache key. See the [README](../README.md) for
configuration. For a developer-only override in one browser tab, run one of these alternatives
in DevTools and reload:

```js
sessionStorage.setItem("cjs-api-format", "json");
sessionStorage.setItem("cjs-api-format", "msgpack");
// Restore the VITE_API_FORMAT build setting (or legacy v1 when it is unset).
sessionStorage.removeItem("cjs-api-format");
```

The override intentionally uses session storage because application routing canonicalizes query
parameters. Both API bases use the selected transport. MessagePack requires a matching content type
and never falls back to JSON.

V2 JSON keeps the documented object fields. V2 MessagePack encodes known Go structs as positional
arrays to avoid field-name and conversion overhead; maps and dictionary-like records remain maps.
`normalizers.ts` reads either representation directly in its existing normalization pass, validates
the minimum tuple length at every known struct boundary, and permits appended fields for compatible
schema growth. The backend's `internal/server/v2_array_schema_test.go` locks the positional layout.

For benchmarks, compare the same endpoint and parameters with v2 JSON and v2 MessagePack. Compare
cold-cache runs with cold-cache runs and warm-cache runs with warm-cache runs; browser caching and
connection reuse can outweigh payload differences. The MessagePack client starts loading its decoder
beside the first API request, so record first-load and decoder-warm timings separately. Timings include
backend serialization and frontend decoding/normalization, not only compressed bytes on the wire.

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
`normalizers.ts`, without an intermediate MessagePack-to-JSON conversion. Required identity fields fail with a safe `invalid-response`
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
