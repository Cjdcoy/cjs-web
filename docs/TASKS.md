# CJS agent task backlog

This backlog is the executable delivery plan for future agents. Tasks are scoped
to minimize file overlap and may be split further, but their acceptance criteria
must not be weakened.

## Status protocol

Allowed statuses: `queued`, `ready`, `in progress`, `blocked`, `done`. `Queued`
means dependencies are not yet complete; change it to `ready` when they are.

Before coding, an agent must:

1. read `AGENTS.md` and `docs/PROJECT_PLAN.md`;
2. select a `ready` task whose dependencies are `done`;
3. change its status to `in progress` and add an owner/handoff line;
4. inspect relevant code through the codebase-memory MCP graph;
5. keep changes inside the listed boundary or document why expansion is needed.

On handoff, record validation commands and remaining risks. Mark a task `done`
only when all acceptance criteria are met.

## Dependency map

```mermaid
flowchart TD
  T1[CJS-001 baseline] --> T2[CJS-002 quality toolchain]
  T1 --> T3[CJS-003 architecture and routing]
  T1 --> T4[CJS-004 design system]
  T2 --> T5[CJS-005 API boundary]
  T3 --> T6[CJS-006 shell and URL state]
  T4 --> T6
  T5 --> T7[CJS-007 servers]
  T5 --> T8[CJS-008 leaderboards]
  T5 --> T9[CJS-009 maps]
  T5 --> T11[CJS-011 players]
  T6 --> T7
  T6 --> T8
  T6 --> T9
  T6 --> T11
  T9 --> T10[CJS-010 map detail]
  T11 --> T12[CJS-012 player detail]
  T9 --> T13[CJS-013 favorites]
  T11 --> T13
  T6 --> T14[CJS-014 about and metadata]
  T7 --> T15[CJS-015 integration hardening]
  T8 --> T15
  T10 --> T15
  T12 --> T15
  T13 --> T15
  T14 --> T15
  T15 --> T16[CJS-016 release pipeline]
  T16 --> T17[CJS-017 post-MVP analytics]
  T16 --> T18[CJS-018 COD4 readiness]
```

After CJS-005 and CJS-006, CJS-007 through CJS-009 and CJS-011 may run in
parallel. Each feature owns its directory and must consume shared APIs through
public exports rather than editing another feature.

## Foundation

### CJS-001 — Establish repository baseline and identity

- **Status:** done
- **Owner:** Codex / repository bootstrap session
- **Dependencies:** none
- **Primary boundary:** root configuration, package metadata, README, CI/runtime
  scaffolding; no feature redesign
- **Goal:** turn the uncommitted prototype into a reproducible CJS baseline that
  matches the J4L core stack.
- **Work:**
  - Rename package/site metadata from JH Statistics to CJS/CodJumper Stats.
  - Align Node 26, React, TypeScript, Vite, Vite React plugin, and Lucide versions
    with `../j4l-web`; regenerate the npm lockfile with the agreed versions.
  - Confirm strict TypeScript, `npm ci`, `npm run build`, `.gitignore`, environment
    example, Docker Compose/mise, SPA fallback, and Cloudflare dry-run behavior.
  - Ensure generated `dist`, `node_modules`, build info, local agent state, and
    secrets are ignored.
- **Acceptance:** a clean checkout installs with `npm ci`; `npm run build` passes;
  the built app can directly load every current path through its static host;
  package, HTML, and README consistently say CJS.
- **Validation:** `npm ci`; `npm run build`; inspect `git status --short`; run the
  documented local static-host smoke test.
- **Completed 2026-08-15:** CJS metadata and independent About content are in
  place; Node 26/npm 11 are pinned; J4L-aligned dependency ranges and the npm
  lockfile are current; nginx served every current and fallback SPA path with
  HTTP 200; Wrangler 4.114.0 completed a dry run with no bindings or deployment.
- **Completion validation:** `npm ci`; `npm run build`; static Docker image build;
  nginx route matrix; `wrangler deploy --dry-run`; ignore and public-identity
  scans. All passed.

### CJS-002 — Add the quality toolchain and CI gate

- **Status:** done
- **Owner:** Codex / CJS-002 quality-tooling session
- **Dependencies:** CJS-001
- **Primary boundary:** lint/format/test configuration, package scripts, test
  setup, CI workflow
- **Goal:** provide one deterministic local and CI verification command.
- **Work:**
  - Add ESLint for strict TypeScript/React/hooks rules and Prettier.
  - Add Vitest, React Testing Library, user-event, DOM matchers, and request
    mocking suitable for API-driven component tests.
  - Add `format`, `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, and
    `verify` scripts.
  - Make CI use Node 26, `npm ci`, and `npm run verify` with dependency caching.
  - Add a minimal render test that proves the harness, not product behavior.
- **Acceptance:** intentionally malformed formatting, lint, type, and test cases
  fail the appropriate stage; `npm run verify` passes on the repository; CI has
  no sibling-repository or live-API dependency.
- **Validation:** `npm run verify`.
- **Completed 2026-08-15:** Added strict TypeScript/React/hooks/accessibility
  linting, repository-wide Prettier checks, Vitest with React Testing Library,
  user-event, DOM matchers, MSW request interception, V8 coverage, the complete
  package-script surface, Docker/mise parity, and the CI `verify` gate.
- **Completion validation:** isolated malformed formatting, lint, type, and test
  probes each failed their intended gate and were removed; local and clean
  Docker `npm ci` environments both passed `npm run verify` with 5 test files and
  25 tests; dependency audit reported zero vulnerabilities.

### CJS-003 — Introduce feature architecture and real routing

- **Status:** done
- **Owner:** Codex / wave 1 CJS-003
- **Dependencies:** CJS-001
- **Primary boundary:** `src/app`, `src/lib/routing`, route entry points, migration
  shims
- **Goal:** replace one-time pathname branching with reactive, testable routes.
- **Work:**
  - Create the target directories and public module boundaries from the project
    plan without doing page redesigns.
  - Implement a route table for `/`, `/leaderboards`, `/maps`, `/maps/:mapId`,
    `/players`, `/players/:playerId`, `/favorites`, `/about`, and a not-found page.
  - Redirect legacy `/map?mapid=` and `/player?playerid=` URLs.
  - Add an ADR if introducing a router dependency.
  - Preserve direct-load and browser back/forward behavior.
- **Acceptance:** every route is linkable and reactive; legacy links resolve;
  unknown paths render a useful 404; routing tests cover navigation, back/forward,
  direct loading, and redirects.
- **Validation:** routing test suite; `npm run build` (or `npm run verify` after
  CJS-002).
- **Completed 2026-08-15:** Added feature public exports, a typed route table,
  reactive History API navigation, nested map/player detail routes, legacy URL
  replacement redirects, and a useful not-found page without adding a router
  dependency.
- **Completion validation:** focused routing suite (18 tests), full test suite
  (25 tests), scoped ESLint and Prettier checks, `npm run typecheck`,
  `npm run build`, and direct-load HTTP 200 smoke checks for every public,
  nested, and fallback path. All CJS-003 checks passed. The repository-wide
  `npm run verify` remains pending completion of the concurrent CJS-002 and
  CJS-004 slices.

### CJS-004 — Build the J4L-aligned design system

- **Status:** done
- **Owner:** Codex / wave 1 CJS-004
- **Dependencies:** CJS-001
- **Primary boundary:** `src/styles`, `src/components/ui`, component gallery or
  test fixtures
- **Goal:** define the reskin once, before independent feature pages diverge.
- **Work:**
  - Implement tokens from the project plan for color, type, spacing, radii,
    borders, shadows, motion, layers, and breakpoints.
  - Add reset/global styles and primitives for button, link, icon button, input,
    select, segmented control, badge, panel/card, table, skeleton, empty/error
    states, pagination, and visually hidden text.
  - Document responsive table-to-card conventions and focus/error states.
  - Check normal, hover, focus-visible, disabled, loading, and destructive states.
- **Acceptance:** primitives use tokens rather than scattered literals; contrast
  and keyboard focus meet WCAG AA; mobile/desktop examples have no clipping;
  reduced motion is respected.
- **Validation:** component tests, accessibility checks, and visual inspection at
  360px, 768px, and 1440px.
- **Completed 2026-08-15:** added the tokenized J4L-aligned color, typography,
  spacing, shape, elevation, motion, layer, and breakpoint foundation; reset and
  global utilities; the full primitive set; responsive table-to-card behavior;
  usage conventions; and an interactive component gallery.
- **Completion validation:** six focused design-system tests; computed WCAG AA
  contrast checks (minimum tested ratio 5.07:1); Firefox WebDriver inspection at
  360px, 768px, and 1440px with no horizontal overflow; normal, hover,
  focus-visible, disabled, loading, destructive, and reduced-motion state checks;
  and `npm run verify` (25 tests plus production build). All passed.

### CJS-005 — Create the typed API and capability boundary

- **Status:** done
- **Owner:** Codex / wave 1 CJS-005
- **Dependencies:** CJS-002
- **Primary boundary:** `src/lib/api`, API fixtures/tests, shared domain types
- **Goal:** make API changes and malformed payloads fail at one controlled edge.
- **Work:**
  - Implement a configurable JSON client with URL encoding, cancellation,
    structured errors, bounded transient retry policy, and safe status context.
  - Add distinct `Source`, `Game`, `Fps`, and capability types. Initially expose
    `jh|j4l`, `cod2`, and the documented FPS values.
  - Add typed endpoints and normalizers needed by MVP screens: tracker servers,
    leaderboards, maps/tops, players/search/performance/positions/tops/routes, and
    source-compatible J4L rank/activity summaries.
  - Store anonymized representative fixtures and test every normalizer and URL.
  - Publish feature-facing functions through one stable API index.
- **Acceptance:** views never cast response JSON; unsupported capability calls are
  prevented before fetch; malformed fixtures return safe errors/defaults rather
  than crashing; all MVP endpoints have URL and normalization tests.
- **Validation:** API unit/contract suite; `npm run verify`.
- **Completed 2026-08-15:** added the typed `src/lib/api` boundary with distinct
  source/game/FPS/capability types, J4L capability gates, configurable safe GET
  retries, structured errors, cancellation, all MVP endpoint adapters, defensive
  normalizers, anonymized fixtures, stable exports, legacy-screen compatibility,
  and API boundary guidance.
- **Completion validation:** 28 focused API contract tests; 64 repository tests;
  current official OpenAPI and read-only JH/J4L payload compatibility checks; and
  full `npm run verify` (format, lint, typecheck, coverage, production build).
  All passed; API boundary line coverage is 93.17%.

## MVP vertical slices

### CJS-006 — Application shell, navigation, and URL-state helpers

- **Status:** done
- **Owner:** Codex / wave 2 CJS-006
- **Dependencies:** CJS-003, CJS-004
- **Primary boundary:** `src/app`, shell components, `src/lib/routing` URL helpers
- **Goal:** provide the shared frame all feature agents can target.
- **Work:** build the CJS header, desktop/mobile navigation, main landmark,
  footer, skip link, route pending indicator, page container, source context, and
  typed helpers for query-string filter state.
- **Acceptance:** keyboard/mobile navigation works; the active route is conveyed
  without color alone; filters can round-trip through encoded URLs; no copied
  branding or maintainer links remain.
- **Validation:** shell integration tests, accessibility scan, 360px and 1440px
  inspection, `npm run verify`.
- **Completed 2026-08-15:** centralized the responsive CJS shell at the router;
  added the header, desktop/mobile navigation, main landmark, skip link, pending
  indicator, page container, independent footer, and URL-backed source context;
  and published typed, defensive query-state codecs and hooks for feature
  filters.
- **Completion validation:** 27 focused shell/routing tests, axe-core with zero
  violations, keyboard and source URL round-trip integration coverage, Firefox
  inspection at 360px and 1440px with no clipping, and `npm run verify` with 10
  test files and 64 tests. All passed.

### CJS-007 — Live servers experience

- **Status:** done
- **Owner:** Codex / wave 3 CJS-007
- **Dependencies:** CJS-005, CJS-006
- **Primary boundary:** `src/features/servers`
- **Goal:** deliver the home/server dashboard against Tracker endpoints.
- **Work:** source and populated-only filters, manual refresh, optional polling
  with visibility awareness, last-updated/stale status, responsive cards/list,
  player totals, map/server information, copy/connect action only when valid.
- **Acceptance:** all async states are explicit; refresh does not blank successful
  stale data; malformed server payloads cannot crash the page; unsupported game
  filters are not shown.
- **Validation:** server normalizer and component tests with mocked success,
  partial, empty, slow, aborted, and failed responses; `npm run verify`.
- **Completed 2026-08-15:** Replaced the legacy server-page export with a
  feature-owned live dashboard covering URL-backed populated/layout filters,
  source-aware requests and links, manual refresh, optional visibility-aware
  polling, last-updated/stale feedback, responsive grid/list cards, player and
  map details, defensive partial-payload handling, and validated copy-address
  actions. Unsupported COD4/game-version controls are not rendered.
- **Contract evidence:** Checked `https://api.jump4life.org/docs` and the live
  OpenAPI contract on 2026-08-15. `/api/v1/tracker/servers` documents only the
  shared `source` parameter; its JSON response schema remains open (`{}`), so
  the feature consumes the typed CJS API boundary and applies a second safe
  display-model normalization step.
- **Completion validation:** 21 focused server model/component tests passed,
  including success, partial, empty, slow, aborted, failed, stale-refresh,
  malformed-payload, URL-state, visibility-polling, and axe coverage;
  `npm run verify` passed with 19 test files and 117 tests. Firefox layout
  inspection found no horizontal overflow at a constrained 360px content width
  or a 1440px desktop viewport.
- **Remaining risk:** The upstream Tracker JSON schema is not structurally
  specified in OpenAPI; unexpected future fields are safely ignored, while
  missing required transport fields surface the explicit error state.

### CJS-008 — Leaderboards experience

- **Status:** done
- **Owner:** Codex / CJS-008 leaderboards session
- **Dependencies:** CJS-005, CJS-006
- **Primary boundary:** `src/features/leaderboards`
- **Goal:** make supported competitive boards searchable and shareable.
- **Work:** source, board, FPS, pagination/limit, sorting where valid, player links,
  responsive table/cards, and capability-gated J4L rank XP. Retain region/time
  controls only if the API contract/data proves them meaningful.
- **Acceptance:** invalid URL combinations normalize predictably; rank XP cannot
  be selected for `jh`; changing controls updates the URL and result; table
  headers and ranking semantics are accessible.
- **Validation:** parameter matrix and UI tests; direct-load representative URLs;
  `npm run verify`.
- **Completed 2026-08-15:** Replaced the legacy page export with a typed
  leaderboards feature covering canonical URL-backed board/FPS/search/page-size/
  page/sort state; capability-safe J4L rank XP; cancellation-aware loading,
  refresh, stale, empty, and error states; stable player links; and accessible
  official-rank semantics in a responsive table/card presentation. Documented
  the live API contract at `https://api.jump4life.org/docs` and omitted the
  unsupported prototype region/time controls.
- **Completion validation:** Fourteen focused parameter-matrix and UI tests
  passed, including representative direct loads, request cancellation, URL
  normalization, sorting, paging, error/empty states, player links, and an
  axe-core scan. Repository-wide `npm run verify` passed with 19 test files and
  117 tests.
- **Remaining risk:** Automated 390px/1440px image capture was attempted, but
  concurrent stuck Firefox jobs prevented a clean screenshot in this session;
  the shared 48rem table-to-card rules, feature breakpoints, and semantic UI
  tests passed, but a later manual visual smoke check is still worthwhile.

### CJS-009 — Maps discovery experience

- **Status:** done
- **Owner:** Codex / CJS-009 maps session
- **Dependencies:** CJS-005, CJS-006
- **Primary boundary:** `src/features/maps` excluding detail-specific components
- **Goal:** provide fast map discovery with durable filters.
- **Work:** source, search, route type, media availability when supported, FPS
  difficulty, sort options based on real fields, responsive view mode, result
  count, favorites action, and links to stable detail routes.
- **Acceptance:** filter/sort combinations are deterministic and URL-backed;
  missing images/metadata degrade gracefully; large lists avoid repeated
  expensive transforms; keyboard users can reach all map actions.
- **Validation:** filter/sort unit tests, map list integration tests, mobile and
  desktop inspection, `npm run verify`.
- **Completed 2026-08-15:** Replaced the legacy list page with a typed maps
  feature slice covering URL-backed source/search/type/media/FPS/difficulty/sort,
  list/grid view and pagination; deterministic prepared-data transforms;
  cancellation-aware loading, refresh, stale, empty and error states; resilient
  metadata presentation; favorites actions; and source-stable detail links.
- **Completion validation:** Seven focused map tests passed; repository-wide
  `npm run verify` passed with 19 test files and 117 tests; headless visual
  inspection passed at 390×844 and 1440×1000 viewports.
- **Follow-up resolved:** CJS-013 replaced the temporary favorite adapter;
  CJS-010 owns the completed map-detail behavior.

### CJS-010 — Map detail and top runs

- **Status:** done
- **Owner:** Codex / CJS-010 map-detail session
- **Dependencies:** CJS-009
- **Primary boundary:** map detail files within `src/features/maps`
- **Goal:** turn `/maps/:mapId` into a complete, shareable map record.
- **Work:** metadata summary, available FPS/checkpoint selection, top runs,
  player links, source context, valid media/replay links if supplied, and a clear
  unavailable map state.
- **Acceptance:** route changes cancel obsolete requests; selected FPS/checkpoint
  is shareable; no stale run list is presented as another map's data; missing
  fields do not produce broken labels.
- **Validation:** route/data race tests, API error states, deep-link smoke test,
  `npm run verify`.
- **Completed 2026-08-15:** Replaced the legacy detail export with a feature-owned
  map record covering source-stable metadata, URL-backed FPS/checkpoint
  selection, checkpoint-aware top runs, safe player links and plain COD names,
  validated media URLs, favorites continuity, and explicit loading, unavailable,
  catalog-error, run-error, and empty states. Map and run requests are separately
  keyed and cancelled so stale route or selection data is never relabeled.
- **Contract evidence:** Rechecked the live API docs, OpenAPI contract, and
  non-identifying payload structure on 2026-08-15. `/api/v1/map/all` documents
  `source`; `/api/v1/map/tops` documents `source`, `fps`, `cpid`, and optional
  `limit`. The contract supplies no replay URL, so the UI does not invent one and
  only exposes HTTP(S) map media URLs actually present in normalized data.
- **Completion validation:** Eleven focused model/component tests passed,
  including route and FPS races, request cancellation, URL checkpoint state,
  partial endpoint failure, unavailable/error states, and a direct nested-route
  load. Repository-wide `npm run verify` passed with 26 test files and 156 tests.
  Headless Firefox found no document overflow in the 390px loading state, the
  fully rendered 500px compact record/table, or the 1440px desktop record/table.
- **Remaining risk:** The live J4L top-runs endpoint can return HTTP 500 for an
  otherwise valid checkpoint; the map remains usable and the failure is confined
  to a retryable runs panel. Replay links remain omitted until the API publishes
  a URL contract.

### CJS-011 — Player discovery experience

- **Status:** done
- **Owner:** Codex / CJS-011 players session
- **Dependencies:** CJS-005, CJS-006
- **Primary boundary:** `src/features/players` excluding profile-specific files
- **Goal:** make players discoverable without overwhelming the browser or API.
- **Work:** source-aware name search, documented list metadata, stable sorting,
  COD color rendering with accessible text, badges only when backed by data,
  favorites action, responsive result view, and profile links.
- **Acceptance:** search is debounced/cancelled as appropriate; unsafe game color
  input is rendered as text spans only; unsupported inferred badges are removed;
  result state is URL-backed.
- **Validation:** search race tests, name/color parser tests, component tests,
  `npm run verify`.
- **Completed 2026-08-15:** Replaced the eager legacy directory with a typed
  player feature that uses the bounded, source-aware name endpoint; debounces
  and cancels obsolete requests; keeps search/source/sort state shareable;
  presents documented country, visits, and last-seen metadata; renders COD color
  controls as accessible React text spans; omits inferred role/status badges;
  and provides source-stable profile links and favorites actions.
- **Completion validation:** Eleven focused parser, stable-sort, request-race,
  URL-state, safety, favorites, and component tests passed. Repository-wide
  `npm run verify` passed with 19 test files and 117 tests; headless visual
  inspection passed at 390×844 and 1440×1000 viewports with no horizontal
  clipping or lost controls.
- **Follow-up resolved:** CJS-013 replaced the temporary favorite adapter;
  CJS-012 owns the completed profile behavior.

### CJS-012 — Player profile and performance

- **Status:** done
- **Owner:** Codex / CJS-012 player-profile session
- **Dependencies:** CJS-011
- **Primary boundary:** profile files within `src/features/players`
- **Goal:** provide a stable profile view that adapts to each source's capability.
- **Work:** identity/activity summary, performance stats, leaderboard positions,
  top runs, route completion, J4L rank/activity summary, source switch behavior,
  map links, and unavailable/deleted player handling.
- **Acceptance:** requests cancel on player/source changes; J4L-only sections are
  capability-gated; partial endpoint failure leaves unaffected sections usable;
  heading/landmark order remains coherent.
- **Validation:** partial-failure integration tests, capability matrix, deep-link
  smoke test, `npm run verify`.
- **Handoff:** Replaced the legacy profile export with a feature-owned,
  responsive profile view. Common and J4L-only endpoints settle independently,
  keep stale data visible during refresh failures, and abort on superseding
  player/source/filter requests. Source, FPS, and leaderboard choices remain in
  the URL; top-run checkpoint links and route-completion map links use their
  corresponding map lookup contracts. Invalid links, API `404` responses, empty
  sections, and partial/all-endpoint failures have deliberate UI states.
- **Contract evidence:** Checked `https://api.jump4life.org/docs` and the live
  OpenAPI contract on 2026-08-15. Profile endpoint/parameter and capability notes
  are recorded in `src/features/players/README.md`; XP rank and activity summary
  remain capability-gated to `source=j4l`.
- **Tests:** Added focused profile model and integration coverage for deep-linked
  filters, source capability gating, map links, partial failure, request
  cancellation, deleted/unavailable players, and malformed player IDs. All 152
  tests across 25 files pass through `npm run verify`.

### CJS-013 — Versioned favorites

- **Status:** done
- **Owner:** Codex / CJS-013 favorites integration session
- **Dependencies:** CJS-009, CJS-011
- **Primary boundary:** `src/features/favorites`, `src/lib/storage`, favorite
  controls exposed by maps/players
- **Goal:** make local favorites reliable across schema changes and sources.
- **Work:** versioned storage schema keyed by entity type/source/id, safe parser
  and migration, add/remove/clear operations, cross-tab updates, unavailable
  entity behavior, maps/players tabs, and empty state.
- **Acceptance:** malformed storage never crashes startup; same numeric ID from
  two sources cannot collide; actions are keyboard-accessible and update across
  open tabs; migration tests preserve valid legacy entries.
- **Validation:** storage/migration unit tests, cross-tab integration test,
  `npm run verify`.
- **Completed 2026-08-15:** Added a source-qualified version 1 favorites document,
  safe parsing and legacy-key migration, add/remove/toggle/type-clear operations,
  same-tab and cross-tab subscriptions, and an unavailable-snapshot fallback.
  Rewired map discovery/detail and player search/profile controls to the shared
  store. Replaced the legacy screen with feature-owned URL-backed keyboard tabs,
  source-aware map/player cards, individual and group removal, empty states,
  live counts, and explicit stale/local-data guidance.
- **Completion validation:** Four storage/migration/cross-tab tests and three
  favorites page tests pass, including source-collision, unavailable-entry,
  keyboard navigation, and axe-core coverage. The six affected map/player suites
  also pass. Repository-wide `npm run verify` passes with 28 test files and 163
  tests, plus the production build.
- **Remaining risk:** Firefox screenshot validation at 390×844 and 1440×1000 was
  attempted with populated source-collision and unavailable-entry fixtures, but
  the environment's headless software compositor could not map a framebuffer.
  Responsive CSS, semantic rendering, keyboard behavior, and axe-core checks
  passed; a later manual visual smoke check remains worthwhile.

### CJS-014 — About, metadata, and public-project content

- **Status:** done
- **Owner:** Codex / CJS-014 about-and-metadata session
- **Dependencies:** CJS-006
- **Primary boundary:** `src/features/about`, document metadata, public static
  metadata assets
- **Goal:** clearly explain CJS ownership, data provenance, and limitations.
- **Work:** independently written about page, links approved by the owner, API and
  community attribution, privacy/local-storage note, open-source repository link,
  per-route titles/descriptions, favicon/social metadata using owned assets.
- **Acceptance:** no reference-site maintainer data or wording remains; links are
  valid and safe; every route has a useful title; local-storage/API behavior is
  accurately described.
- **Validation:** metadata/content tests, link review, `npm run verify`.
- **Completed 2026-08-15:** Replaced the legacy About export with a feature-owned,
  independently written page covering CJS ownership, public API provenance,
  browser-local favorites, supported source/game scope, capability limitations,
  and verified public project/API/community links. Added route-aware title,
  description, canonical, Open Graph, and Twitter metadata plus owned favicon,
  manifest, and social-card assets.
- **Completion validation:** Nineteen focused content, metadata, routing, and axe
  tests passed; all four external links returned HTTP 200; Firefox inspection at
  390×844 and 1440×1000 found no clipping; `npm run verify` passed with 25 test
  files and 152 tests.

## Integration and release

### CJS-015 — Accessibility, responsive, and end-to-end hardening

- **Status:** done
- **Owner:** Codex / CJS-015 integration-hardening session
- **Dependencies:** CJS-007, CJS-008, CJS-010, CJS-012, CJS-013, CJS-014
- **Primary boundary:** cross-feature fixes, E2E configuration/tests, performance
  budgets
- **Goal:** make the assembled MVP dependable as one product.
- **Work:** critical-path browser tests, automated accessibility checks, manual
  keyboard/zoom/reduced-motion review, small/large viewport pass, slow/error
  network pass, route-level lazy loading where valuable, image/layout-shift
  review, and removal of dead prototype code.
- **Acceptance:** servers, leaderboards, map discovery/detail, player
  discovery/profile, and favorites smoke flows pass; no serious automated a11y
  violations; no horizontal page overflow at 320px or 200% zoom; production build
  has no unexpected console errors.
- **Validation:** `npm run verify`; E2E suite; documented manual browser matrix;
  production bundle inspection.
- **Completed 2026-08-15:** Added strict production-preview Playwright flows for
  every critical product area across Chromium, Firefox, and WebKit; browser axe,
  console/page-error, 320px, 200%-scale, reduced-motion, keyboard, focus, retry,
  persistence, and nested-refresh checks; route focus/status and chunk-failure
  recovery; mobile sorting and contrast fixes; keyed async cancellation; lazy
  feature routes; enforced manifest-based bundle budgets; and dead prototype/CSS
  removal.
- **Completion validation:** `npm run verify` passes with 30 Vitest files and 167
  tests, the 27-test three-engine browser matrix passes, and every production
  bundle metric remains below its checked ceiling. The browser/manual review and
  measurements are recorded in [CJS-015-VALIDATION.md](CJS-015-VALIDATION.md).
- **Remaining risk:** The headless environment cannot provide a physical screen
  reader session. Live-region content, focus behavior, semantic markup, browser
  axe results, and three-engine behavior are covered; an NVDA/Firefox or
  VoiceOver/Safari listening smoke remains worthwhile before public release.

### CJS-016 — Public release and deployment pipeline

- **Status:** done
- **Owner:** Codex / CJS-016 public-release session
- **Dependencies:** CJS-015
- **Primary boundary:** GitHub workflows, Cloudflare configuration, release docs;
  production mutation requires explicit owner authorization
- **Goal:** make public contributions and owner-controlled releases safe.
- **Work:** finalize CODEOWNERS/Dependabot, PR template, security/contribution
  guidance, CI branch gate, Cloudflare dry run, SPA asset caching/headers, source
  maps policy, release checklist, rollback notes, and production domain decision.
- **Acceptance:** a fork can build/test without secrets or sibling repos;
  deployment remains disabled by default until owner configuration; dry run
  succeeds; no credentials or internal artifacts are tracked.
- **Validation:** fresh-checkout `npm ci && npm run verify`; Wrangler dry run;
  workflow syntax/security review. Do not deploy without explicit approval.
- **Completed 2026-08-15:** Added owner-review boundaries, grouped Dependabot
  updates, contribution/security guidance, a pull request template, an accepted
  release-boundary ADR, and an owner-only release/rollback runbook. Preserved the
  protected `Build and validate` check while extending CI with the three-engine
  browser suite and pinned Cloudflare dry run. Deployment now consumes the exact
  successful `main` revision, validates its custom-domain/secrets configuration,
  remains kill-switch gated, and performs a post-deploy route/header/cache smoke.
  Added Cloudflare/nginx security headers, immutable fingerprinted-asset caching,
  explicit no-source-map policy, upload exclusions, and enforced release-artifact
  checks. Enabled GitHub private vulnerability reporting.
- **Completion validation:** An isolated source copy passed `npm ci` and
  `npm run verify` with 30 test files / 167 tests; Wrangler 4.114.0 strict dry run
  succeeded with no bindings or deployment; actionlint, gitleaks, npm audit,
  Docker/nginx syntax, nested SPA fallback, security-header, and immutable-cache
  checks passed. Evidence and owner-only first-release actions are recorded in
  [CJS-016-VALIDATION.md](CJS-016-VALIDATION.md).
- **Owner decisions before first release:** publish a license before accepting
  outside code, choose the dashboard-managed HTTPS domain, set
  `CJS_PRODUCTION_URL` and least-privilege production secrets, then explicitly
  authorize enabling the currently false deployment gate. No production release
  or Cloudflare configuration mutation was performed for this task.

### CJS-019 — Server browser readability refinement

- **Status:** done
- **Owner:** Codex / server-card readability session
- **Dependencies:** CJS-007, CJS-015
- **Primary boundary:** `src/features/servers`, `public/maps/cards`, focused
  server fixtures/tests
- **Goal:** make the combined live-server browser scannable without hiding
  connection or roster details.
- **Work:** display both documented sources with Jump4Life first, strengthen the
  map-led card hierarchy, add derived country context and selectable/copyable
  addresses, and remove redundant mode/player-count facts from individual cards.
- **Acceptance:** both source feeds remain independently cancellable and expose
  partial failures; map, country, hostname, address, status, and roster content
  remain readable over artwork; source-correct map links and clipboard feedback
  work with keyboard and assistive technology; grid/list layouts do not clip at
  mobile or desktop widths.
- **Validation:** focused server model/component tests, accessibility checks,
  responsive browser inspection, `npm run verify`.
- **Completed 2026-08-22:** Replaced the single-source card wall with independent
  J4L/JH feeds grouped in a fixed J4L-first order, aggregate totals, and
  source-local loading/error/refresh handling. Rebuilt cards around prominent
  map artwork and names, hostname-derived country flags, selectable addresses,
  compact copy actions, and rosters while removing redundant mode/player-count
  facts. Imported the 609 tracked AVIF card images from the owned sibling
  `j4l-web` asset library and resolve them directly by map name, with lazy
  loading and the original 15 KB WebP as a decode/missing-image fallback.
- **Contract evidence:** Rechecked the live API docs and OpenAPI contract on
  2026-08-22. `/api/v1/tracker/servers` remains source-specific with the
  documented `source=j4l|jh` parameter and an open JSON schema; no map-image or
  country field/endpoint is published. Country labels are therefore explicitly
  derived from known hostname prefixes, with an honest unknown-region fallback.
- **Completion validation:** 21 focused server tests pass, including dual-source
  loading/order, source-correct links, flags, address presentation, redundant
  fact removal, independent cancellation/polling, partial failures, clipboard,
  URL state, image URL/fallback behavior, and axe coverage. The focused server
  lint and 21 tests pass; `npm run build` passes with production performance and
  artifact budgets covering 638 release files. Chromium inspection against live
  payloads at 360×800 and 1440×1000 found 24 cards, decoded every available
  exact-match map image at 960px intrinsic width, and found no console errors or
  horizontal overflow. A final repository-wide `npm run verify` rerun is pending
  completion of the concurrent CJS-020 leaderboard edits; its current lint stop
  is outside this task boundary.
- **Refined 2026-08-22:** Removed the visible hero, aggregate summary, and
  refresh-status rows so the page begins with compact controls and the J4L-first
  server list. Removed the full-image gradient, reduced control sizing and mobile
  wrapping, and standardized unknown or empty rosters as “Server empty.” A
  follow-up removed experimental label backplates and dark-name outlines in
  favor of plain white map names and a lighter roster-row surface. Chromium
  inspection at 360×800 and 1440×1000 found no full-image overlay, no horizontal
  overflow, and only the toolbar plus server groups in normal page flow.
- **Interaction follow-up 2026-08-22:** Replaced the separate copy button with a
  keyboard-accessible address row that explains “Click to copy” and confirms the
  result without hiding the IP. A later refinement removed the redundant “View
  map profile” cue; supported map names remain the link itself.
- **Density follow-up 2026-08-22:** Removed the light per-player roster boxes in
  favor of compact, unframed name-and-ping rows. The card view now uses four
  columns on wide desktop screens and steps down to three, two, and one column
  without clipping at narrower widths.
- **Game-filter follow-up 2026-08-22:** Added a URL-backed COD2/COD4 segmented
  filter using the live tracker feed's `game_type` discriminator. COD2 remains
  the default across both sources; COD4 is capability-gated to the JH group and
  does not link into COD2-only map profiles. The live JH feed exposed 13 COD2
  and 11 COD4 cards during validation. The focused server suite passes with 22
  tests, the production build passes, and Chromium checks at 390×844 and
  1440×1000 found no console errors or horizontal overflow.

### CJS-020 — Leaderboard presentation refinement

- **Status:** done
- **Owner:** Codex / leaderboard revamp session
- **Dependencies:** CJS-008, CJS-015
- **Primary boundary:** `src/features/leaderboards`, focused leaderboard tests
- **Goal:** make leaderboard choices and player performance easier to scan.
- **Work:** replace select-heavy board/FPS controls with visible option groups,
  reduce country presentation to a compact flag, restore the API-provided top
  1–10 distribution, and refine the responsive results layout.
- **Acceptance:** every supported board and FPS choice is directly visible and
  URL-backed; country remains accessible without dominating a row; top-place
  counts 1–10 are readable in table and mobile layouts; unsupported J4L/JH
  combinations remain capability-gated.
- **Validation:** focused model/component tests, accessibility scan, responsive
  browser inspection at mobile and desktop widths, `npm run verify`.
- **Completed 2026-08-22:** Replaced board and FPS selects with directly visible,
  keyboard-operable choices while preserving canonical URL state and source
  capability rules. Moved country into a compact accessible flag beside each
  player and restored a responsive top-1-through-top-10 count strip with relative
  bars. Kept rank XP progress and board-specific metric/points columns distinct.
- **Contract evidence:** Rechecked a live, anonymized
  `/api/v1/leaderboard/speed-skill?source=jh&fps=125` response on 2026-08-22; the
  existing `top_list` boundary supplies numeric string keys `1` through `10`, so
  no endpoint or transport change was required.
- **Completion validation:** 16 focused model/component tests pass, including
  visible filter URL behavior, compact flag semantics, all ten top positions,
  cancellation, and axe coverage. `npm run verify` passes with 30 files / 169
  tests and production budgets. Live Chromium inspection at 390×844 and
  1440×1000 found no clipped choices, console errors, or horizontal overflow;
  the 320px E2E leaderboard reflow and keyboard checks passed. The broader
  multi-route responsive test still records an unrelated mocked J4L tracker 500
  from the concurrent server-browser slice.
- **Refined 2026-08-22:** Restyled country markers as flat circular SVG flags
  with podium rims matching the observable reference treatment. The
  zero-dependency MIT `circle-flags` package is bundled locally so rendering is
  consistent without an external runtime service or platform emoji. Removed
  page-size and pagination controls in favor of 25-player progressive batches
  loaded as the scroll sentinel approaches, with a keyboard-operable load-more
  fallback. Legacy `page` and `limit` parameters are now removed from shared
  URLs. Enlarged table labels and values, made uncolored player names white
  without an underline, and retained explicit API-provided COD2 name colors.
- **Follow-up validation:** 17 focused model/component tests pass, including
  observer-triggered loading and legacy pagination URL cleanup. The production
  build passes, and the full `npm run verify` gate passes with 32 files / 174
  tests. Live Chromium checks at 390×844 and 1440×1000 found no console errors
  or horizontal overflow; a mobile scroll expanded 25 initial rows to all 32
  live results automatically.

### CJS-021 — Shared COD2 player-name rendering

- **Status:** done
- **Owner:** Codex / COD2-name rendering session
- **Dependencies:** CJS-007, CJS-008, CJS-010, CJS-012, CJS-013
- **Primary boundary:** shared COD2 name parser/renderer and player-name callsites
  in servers, maps, players, leaderboards, and favorites
- **Goal:** preserve and display API-provided COD2 caret colors consistently
  wherever a player name appears.
- **Work:** centralize the `^0`–`^9` parser and canonical COD2 palette, normalize
  duplicated caret encodings used by the legacy feed, keep plain names for
  filtering and accessible labels, and replace feature-local stripping/rendering.
- **Acceptance:** raw color controls never appear visually; all ten COD2 colors
  match the owned J4L reference implementation; malformed controls remain safe
  literal text; screen readers receive one plain name; server rosters, map runs,
  player search/profile, leaderboards, and saved players use the shared renderer.
- **Validation:** focused parser/component and affected feature tests,
  accessibility scan, responsive browser inspection, `npm run verify`.
- **Completed 2026-08-22:** Centralized COD2 name parsing and rendering in shared
  code, including the canonical `^0`–`^9` palette and duplicated-caret
  normalization from the owned J4L implementation. Server payload normalization
  now preserves encoded names, and servers, map runs, player search/profile,
  leaderboards, and favorite players all render the shared component. Plain
  decoded names remain available for sorting, filtering, announcements, row
  labels, and assistive technology.
- **Completion validation:** 12 focused files / 72 tests pass across the parser,
  shared component, and every affected feature; the full `npm run verify` gate
  passes with 32 files / 174 tests, coverage, lint, formatting, production build,
  performance budgets, and release-artifact checks. Live Chromium inspection at
  360×800 and 1440×1000 rendered 24 server cards and 13 colored name segments
  using the expected computed palette, with no console errors or horizontal
  overflow.

### CJS-022 — Progressive player directory

- **Status:** done
- **Owner:** Codex / progressive player-directory session
- **Dependencies:** CJS-011, CJS-021
- **Primary boundary:** player discovery files within `src/features/players`
- **Goal:** make `/players` useful before a search while keeping the full directory
  inexpensive to render.
- **Work:** load the documented player list ordered by last seen when no search is
  active, preserve bounded name search, and reveal directory rows incrementally
  as the user scrolls with an accessible manual fallback.
- **Acceptance:** the default route shows last-seen players; source/query/sort
  changes cancel obsolete requests; only an initial batch is rendered until the
  scroll sentinel advances; search behavior and stable profile/favorite actions
  remain intact.
- **Validation:** request-race and progressive-render component tests; mobile and
  desktop inspection; `npm run verify`.
- **Completed 2026-08-22:** The default `/players` route now requests the
  documented directory with `sort=last-seen`, while meaningful name queries keep
  using the bounded search endpoint. Results render 50 at a time and advance
  through an Intersection Observer sentinel with an accessible Load more button
  fallback. Source/query/sort changes retain cancellation and stale-state
  handling, and local sorting, profile links, colored names, and favorites remain
  intact.
- **Completion validation:** 11 focused player discovery, progressive-render,
  and request-race tests passed. Repository-wide `npm run verify` passed with 32
  files / 174 tests, coverage, lint, formatting, strict TypeScript, production
  build, performance budgets, and release-artifact checks. Live Chromium checks
  at 390×844 and 1440×1000 displayed the current 8,813-player JH directory in an
  initial 50-row/card batch with no clipping or horizontal overflow.
- **Remaining risk:** The published `/api/v1/player/all` contract has no cursor,
  offset, or limit, so progressive loading bounds browser rendering rather than
  network payload size. True network pagination requires a future API contract.

### CJS-023 — Player profile information architecture refinement

- **Status:** done
- **Owner:** Codex / player-profile refinement session
- **Dependencies:** CJS-012, CJS-021
- **Primary boundary:** player profile files within `src/features/players`, the
  documented jump-score adapter in `src/lib/api`, source-switch behavior for the
  player-detail route in `src/app/shell`, and corresponding browser fixtures
- **Goal:** treat source-qualified player IDs as distinct identities and make the
  profile easier to scan.
- **Work:** prevent source switching from reusing a player ID; split overview,
  best runs, and route completion into URL-backed views; surface common recent
  activity and richer J4L-only rank/activity data on the overview; refine the
  responsive visual hierarchy.
- **Acceptance:** changing source from a profile opens player discovery for the
  new source; tabs are keyboard-accessible and deep-linkable; JH never requests
  J4L-only resources; loading, empty, error, stale, and partial states remain
  deliberate in every view.
- **Validation:** focused profile and shell tests, mobile/desktop inspection,
  `npm run verify`.
- **Completed 2026-08-22:** Source changes from a profile now return to player
  discovery so source-specific numeric IDs are never reused. The profile has
  URL-backed Overview, Best runs, and Route completion views. Overview combines
  common performance/recent records with richer J4L rank and cumulative
  activity. Best runs now consumes `/api/v1/player/jump-scores`, showing total
  jump-skill points/rank and each scoring map's points, rank, and difficulty.
- **Contract evidence:** Rechecked the live docs and OpenAPI contract on
  2026-08-22 and sampled read-only JH/J4L jump-score payloads. Both sources
  publish the same `map_scores` fields used by the view.
- **Completion validation:** 45 focused API/profile/shell tests passed. The full
  `npm run verify` gate passed with 33 files / 181 tests, formatting, lint,
  coverage, strict TypeScript, production build, performance budgets, and
  release-artifact checks. Focused Chromium validation at 320×800 and 1440×1000
  confirmed visible skill points and no horizontal overflow.

### CJS-024 — Server card metadata contrast

- **Status:** done
- **Owner:** Codex / server-card metadata polish session
- **Dependencies:** CJS-019
- **Primary boundary:** `src/features/servers/servers.css`
- **Goal:** improve country and current-map readability over map artwork.
- **Completed 2026-08-22:** Removed the framed backdrop from server country
  flags, increased the flag glyph size, and gave the Current map label the same
  bright foreground and subtle text shadow used by the map name.
- **Validation:** focused formatting/lint checks and `npm run build`.

### CJS-025 — Shared circular country flags

- **Status:** done
- **Owner:** Codex / shared country-flag session
- **Dependencies:** CJS-020, CJS-023, CJS-024
- **Primary boundary:** shared country-flag UI and country displays in servers and
  players
- **Goal:** replace platform-dependent flag emoji and plain country cells with
  the locally bundled Circle Flags artwork already adopted by leaderboards.
- **Acceptance:** server cards, player discovery, and player profiles use one
  accessible shared flag component; invalid or unavailable codes fall back to a
  globe without broken images; country text remains available where useful.
- **Validation:** shared component and affected feature tests, responsive visual
  inspection, `npm run verify`.
- **Completed 2026-08-22:** Added one shared, size-aware country flag component
  backed by the locally emitted Circle Flags SVGs, including `UK` to `GB`
  normalization and an accessible globe fallback for invalid or failed artwork.
  Server cards now use large circular flags; player discovery rows pair compact
  flags with country codes; and profile identity metadata pairs the flag with the
  full country label.
- **Completion validation:** 26 focused shared UI, server, player-list, and player
  profile tests passed. Formatting and repository lint passed; `npm run build`
  passed strict TypeScript, Vite production output (including local country flag
  assets), performance budgets, and release-artifact checks. Live Chromium at
  1440×1000 verified circle flags on servers, the 8,813-player JH directory, and
  a populated JH profile without clipping or broken artwork.
- **Remaining validation:** The full `npm run verify` command reached coverage but
  is currently blocked by two unrelated concurrent player jump-score tests whose
  one-item array expectations were not updated when their shared fixture grew to
  two items. This slice's affected suites remain green.

### CJS-026 — Player run controls and shared player-link interaction

- **Status:** done
- **Owner:** Codex / player interaction polish session
- **Dependencies:** CJS-020, CJS-023
- **Primary boundary:** player profile run filters and shared player-link styling
- **Goal:** make FPS choices immediately visible on Best runs and give linked
  player names one consistent, neutral hover treatment throughout the site.
- **Acceptance:** Best runs exposes one keyboard-accessible button per supported
  FPS value; its key data is easier to read; player links no longer switch to the
  generic green-and-underline treatment and match the leaderboard interaction.
- **Validation:** affected component tests, mobile/desktop browser inspection,
  `npm run verify`.
- **Completed 2026-08-22:** Replaced the Best runs FPS dropdown with six visible
  segmented buttons. The controls use radio semantics, roving keyboard focus,
  concise labels, and a 3×2 phone layout. Increased the run summary and table
  typography. Added a shared neutral player-link variant and applied it to
  leaderboards, player discovery, map records, and favorite players, eliminating
  generic accent-green and underline hover styling.
- **Completion validation:** 23 focused profile, discovery, leaderboard, and
  favorites tests passed before the full repository gate. `npm run verify` passed
  with 33 files / 182 tests, coverage, formatting, lint, strict TypeScript,
  production build, performance budgets, and release-artifact checks. Live
  Chromium checks at 320×800 and 1440×1000 confirmed all FPS choices remain
  readable without page overflow and the larger skill-point hierarchy is clear.

## Post-MVP

### CJS-017 — Replay, activity, and historical analytics

- **Status:** queued
- **Dependencies:** CJS-016
- **Primary boundary:** new feature modules and their API extensions
- **Goal:** expose the remaining documented Replay/Historical/J4L activity value
  without bloating MVP screens.
- **Work:** validate product designs against real payload fixtures, split features
  into independently lazy-loaded routes/panels, add accessible chart/table
  alternatives, pagination, and source capability rules.
- **Acceptance:** each shipped endpoint has contract fixtures/tests; charts have a
  textual/table equivalent; large histories are bounded and cancellable.
- **Validation:** API tests, feature tests, E2E route smoke tests, performance and
  accessibility checks.

### CJS-018 — COD4 capability implementation

- **Status:** blocked
- **Dependencies:** CJS-016 and a published backend COD4 contract/test data
- **Blocker:** the inspected OpenAPI contract exposes `source=jh|j4l` and no COD4
  request capability.
- **Primary boundary:** capability model, compatible feature filters/views, API
  extensions
- **Goal:** add COD4 only from an explicit backend contract, not assumptions made
  from the old reference UI.
- **Work:** document the backend contract, add anonymized COD4 fixtures, extend
  game/source capability matrices, show game selectors only where valid, and
  verify COD2 behavior remains unchanged.
- **Acceptance:** every COD4 request/field is contract-backed; mixed-source/game
  URLs validate predictably; COD2 regression suite passes; unsupported feature
  gaps are communicated honestly.
- **Validation:** contract/unit/integration/E2E matrix for COD2 and COD4;
  `npm run verify`.

## Agent handoff template

```md
Task: CJS-###
Status: in progress | blocked | done
Owner: <agent/session>
Changed scope: <files/modules>
Validation: <commands and results>
Decisions: <brief list or ADR link>
Remaining work/risks: <specific next actions>
```
