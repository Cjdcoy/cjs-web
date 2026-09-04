# Agent guidance

## Project charter

- The product is **CJS (CodJumper Stats)**, a public frontend for data served by
  `https://api.jump4life.org`.
- The supported data sources are JumpersHeaven (`jh`) and Jump4Life (`j4l`). Do
  not treat a source as a game version. Call of Duty 4 support is future work and
  must remain capability-gated until the API publishes a contract for it.
- Build an independent implementation. The public site at
  `https://cjstats.vercel.app/` is a product and information-design reference
  only. Never copy private source code, proprietary assets, personal contact
  information, or attribution from that project.
- Match the core stack and visual family of `../j4l-web`: Node.js 26, npm,
  React, strict TypeScript, Vite, Lucide icons, and authored CSS.
- Read [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) before changing architecture
  or product scope. Claim one item from [docs/TASKS.md](docs/TASKS.md) and keep
  its status current while working.

## Codebase discovery

- Use `rg` for code discovery: literals, error messages, identifiers,
  configuration, and documentation.
- Before edits spanning a large amount of existing code, delegate an
  implementation-context synthesis to the `local-qwen` MCP server
  (`delegate_to_qwen`, `task_kind: implementation-context`) with the relevant
  files named as `source_files`; it runs locally and costs no model quota.
  Delegate large test or build logs and pre-commit diffs the same way. Always
  make one targeted verification read of the claims the answer turns on, and
  keep every decision and edit here.
- Consult the live [API docs](https://api.jump4life.org/docs) and
  [OpenAPI contract](https://api.jump4life.org/openapi.yaml) before adding or
  changing an endpoint. Do not infer unsupported parameters from the UI.

## Engineering standards

- Keep TypeScript in strict mode. Avoid `any`; accept external payloads as
  `unknown` and validate or normalize them at the API boundary.
- Use named domain types. Keep API transport models separate from view models
  when their shapes differ.
- Organize product code by feature. Shared UI must be genuinely reusable and
  must not import feature modules.
- Keep components focused on rendering and user interaction. Put request
  construction, normalization, persistence, and non-trivial transformations in
  dedicated modules.
- Every request must support cancellation and expose useful error context. Every
  asynchronous view must deliberately handle loading, empty, error, success, and
  stale/refresh states.
- Represent filters and shareable selections in the URL. Persist only local,
  user-specific preferences such as favorites and view mode. Version persisted
  data and recover safely from malformed storage.
- Use semantic HTML first. All interaction must work with a keyboard, visible
  focus must be preserved, controls must have accessible names, and status
  changes must be announced appropriately.
- Use the design tokens in the shared stylesheet. Do not scatter raw brand
  colors, spacing values, shadows, or radii through feature CSS.
- Prefer CSS over JavaScript for responsive layout. Support small mobile screens,
  keyboard navigation, reduced motion, and 200% zoom without lost content.
- Use Lucide for interface icons. Do not add another icon set without an explicit
  design-system decision.
- Follow the repository formatting configuration. Until automated formatting is
  installed, use two-space indentation, double quotes, semicolons, trailing
  commas in multiline structures, and clear descriptive names.
- Add or update tests with behavior changes. Test normalization and state logic
  at the unit level, user-visible component behavior at the integration level,
  and critical navigation/data flows at the end-to-end level.
- Do not log API payloads, player-identifying data, credentials, or environment
  values in production.

## Work discipline

- Keep each pull request focused on one task or one tightly coupled vertical
  slice. Record scope changes and newly discovered work in `docs/TASKS.md`.
- Do not silently broaden the MVP. Replay analytics, historical charts, and COD4
  are post-MVP unless the owner explicitly reprioritizes them.
- Preserve unrelated changes. This repository may have concurrent agents; do not
  reformat or reorganize files outside your task boundary.
- Architecture changes, new runtime dependencies, data persistence changes, and
  departures from the J4L stack require a short ADR under `docs/adr/`.
- Keep the repository public-safe: no secrets, copied private implementation,
  internal URLs, unlicensed assets, or personal information.

## Validation

- Use Node.js 26 and install locked dependencies with `npm ci`.
- During the foundation phase, run every check currently available. Once
  `CJS-002` lands, the handoff gate is `npm run verify`.
- At minimum, run `npm run build` before handing off changes. It must perform
  TypeScript checks and the Vite production build.
- Feature work must also run its relevant unit/integration tests. UI work must be
  checked at mobile and desktop widths; routing work must verify direct-load and
  refresh behavior for nested routes.
- Keep CI and deployment self-contained. They must not depend on sibling
  repositories or the continued availability of the reference site.

## Git workflow

- Make changes through a pull request targeting `main`.
- Do not bypass branch protection or push directly to `main` unless the repository owner explicitly requests it.
- Preserve unrelated user changes and existing merged history.
- Use the repository identity `cjdcoy <22911399+Cjdcoy@users.noreply.github.com>` for commits.

## Production deployment

- Production deployment targets the Cloudflare Worker named `cjs-web`.
- The normal deployment path is a merge to `main`. `.github/workflows/deploy-cloudflare-worker.yml` rebuilds the site and deploys `dist/`.
- Do not run a production deployment, enable or disable its gate, or manually dispatch its workflow without explicit authorization from the repository owner.
- When authorized to dispatch production manually, run:
  `gh workflow run deploy-cloudflare-worker.yml --ref main --repo Cjdcoy/cjs-web`
- Watch the resulting run through completion and verify the configured production domain returns a successful HTML response.

## Cloudflare safety

- For local deployment validation, build first and then run:
  `npx --yes wrangler@4.114.0 deploy --dry-run --config wrangler.jsonc`
- Do not run `wrangler deploy` against production directly unless the repository owner explicitly requests that exact method.
- Keep `workers_dev` and preview URLs disabled.
- Keep custom domains and routes managed in the Cloudflare dashboard; do not add `route` or `routes` to `wrangler.jsonc`.
- Do not retrieve, print, copy, or commit Cloudflare credentials. GitHub production environment secrets provide them to the deployment workflow.
- Do not change Worker bindings, variables, routes, domains, or token permissions unless the task explicitly requires it.
