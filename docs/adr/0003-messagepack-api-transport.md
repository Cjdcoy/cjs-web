# ADR 0003: Opt-in MessagePack API transport

- **Status:** accepted
- **Date:** 2026-09-05

## Context

The backend mirrors data endpoints at `/api/v2` and negotiates compact JSON or MessagePack through
the `Accept` header. V2 MessagePack directly serializes Go structs as positional arrays to minimize
server serialization, transfer, and browser decode costs. The frontend needs browser benchmarks
while retaining the established v1 JSON contract as the unset build default.

## Decision

- Keep an unset format on v1 JSON. Explicit `json` and `msgpack` formats both use `/api/v2`.
- Use the official, exactly pinned `@msgpack/msgpack` package with its default number decoding so
  values behave like `JSON.parse` in JavaScript.
- Load the decoder only for a MessagePack client, starting its download beside the first API request.
  Raise the total JavaScript gzip budget from 125 KiB to 131 KiB for the pinned decoder. Direct
  tuple validation raises the route budget from 32 to 32.5 KiB; the initial budget stays unchanged.
- Select the build format with `VITE_API_FORMAT`; allow developers to override it for one tab with
  the `cjs-api-format` session-storage key and a reload. CI and manual deployment builds read the
  GitHub repository variable `VITE_API_FORMAT`; the production build cache key includes its value.
- Require `application/msgpack` for MessagePack responses. Decode errors fail the request without a
  JSON fallback or retry.
- Normalize positional struct arrays directly through the existing endpoint normalizers. Validate
  each known tuple's minimum length, allow trailing fields, and keep dictionary records as maps. The
  backend schema-lock test is the field-order authority.

## Consequences

Normal and replay API bases share one transport selection and all existing response normalizers.
JSON uses named objects while MessagePack uses positional arrays, so their wire representations
intentionally differ but normalize to the same frontend domain values without a conversion pass.
MessagePack adds one runtime dependency and decoder code to the browser bundle. Format benchmarks
must compare cold with cold or warm with warm browser caches and account for backend serialization
and normalization work as well as transfer size. The first MessagePack request loads the decoder
chunk concurrently, so first-load and decoder-warm timings are separate measurements. Explicit
formats require a v2-capable API deployment; they return 404 against a v1-only backend.
