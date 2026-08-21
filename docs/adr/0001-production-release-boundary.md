# ADR 0001: Owner-gated Cloudflare production releases

- **Status:** accepted
- **Date:** 2026-08-15

## Context

CJS is a static Vite SPA deployed as Cloudflare Worker assets. Repository forks must validate the
package without secrets, while production routes, credentials, and the final custom domain remain
owner-controlled. `workers.dev` and preview URLs are intentionally disabled.

## Decision

- The deployable unit is `dist/` for the Worker named `cjs-web`.
- `main` may deploy only after the **CI / Build and validate** check succeeds.
- `CLOUDFLARE_DEPLOY_ENABLED` remains the owner-controlled kill switch and defaults to `false`.
- `CJS_PRODUCTION_URL` identifies the dashboard-managed HTTPS custom-domain origin. The workflow
  rejects an absent URL, a URL with a path, and `workers.dev`; no domain is hard-coded in source.
- The `production` GitHub environment owns Cloudflare secrets and branch/approval policy.
- Wrangler configuration must not add routes or bindings. Dashboard configuration remains the source
  of truth for the custom domain and route.
- Fingerprinted `/assets/*` responses use immutable one-year browser caching. HTML and stable-name
  assets retain Cloudflare's revalidation behavior.
- Browser source maps are disabled and excluded from the uploaded asset set. The local Vite manifest
  remains build metadata and is excluded by `.assetsignore`.
- A production deployment is verified against the custom domain. Recovery uses a known-good Worker
  version through an explicitly authorized rollback.

## Consequences

Forks can run verification and `wrangler deploy --dry-run` without Cloudflare credentials. A merge
cannot deploy until the owner configures the domain, environment secrets, and gate. Custom-domain or
binding changes cannot be made accidentally through this repository.
