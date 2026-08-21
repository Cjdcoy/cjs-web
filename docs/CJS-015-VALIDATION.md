# CJS-015 validation record

Validated on 2026-08-15 against the Vite production build and preview server. Browser tests use
same-origin network interception with exact request-path and query-parameter matching; any
unregistered API request, unexpected browser console error, or uncaught page error fails the run.

## Browser and manual-review matrix

| Engine                                  | Desktop smoke                                     | Small-screen reflow                                | 200% scale equivalent                                                         | Keyboard, focus, and announcements                                                                              | Result    |
| --------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| Chromium 151                            | All critical data and favorites flows at 1280×720 | All public routes at 320×800; no document overflow | 640×400 CSS viewport at DPR 2, equivalent to a 1280×800 display at 200% scale | Mobile menu, visible leaderboard sorting, route focus/status, favorite removal/clear focus and live-region text | Pass, 9/9 |
| Firefox 153                             | Same production-preview smoke suite               | Same 320×800 route matrix                          | Same 640×400/DPR 2 matrix                                                     | Same keyboard, focus, status, and reduced-motion checks                                                         | Pass, 9/9 |
| WebKit 26.5 (Safari-engine alternative) | Same production-preview smoke suite               | Same 320×800 route matrix                          | Same 640×400/DPR 2 matrix                                                     | Same keyboard, focus, status, and reduced-motion checks                                                         | Pass, 9/9 |

The 200% check models the browser's resulting layout viewport and pixel scale rather than driving
browser-chrome zoom controls. The separate 320 CSS-pixel matrix is a stricter reflow condition.
All eight public routes retain their level-one heading and keep `scrollWidth <= clientWidth + 1`
under both conditions.

This headless environment has no OS screen reader. Route-completion and favorite-removal messages
are asserted in polite live regions, focus transitions are asserted in browsers, semantic markup is
covered by axe, and the implementation received a parallel accessibility review. A physical
NVDA/Firefox or VoiceOver/Safari listening pass remains a worthwhile pre-release manual smoke check.

## Critical flows

- Live servers and leaderboards load from strict mocked contracts.
- Map discovery, detail, favorite persistence, removal, and focus recovery work as one flow.
- Player discovery, profile, favorite persistence, group clear, and focus recovery work as one flow.
- Slow loading is visible; a failed request exposes a retry control; retry recovers to live content.
- `/maps/101` and `/players/501` both survive direct production loads and browser refreshes.
- Every critical public route passes browser axe checks for WCAG 2 A/AA, 2.1 A/AA, and 2.2 AA tags.
- Reduced-motion mode disables loading shimmer animation.

## Accessibility review

- Route completion moves focus to main content and publishes a destination status message.
- Mobile leaderboard sorting uses visible native controls; hidden table-header buttons leave the
  accessibility tree at the mobile breakpoint.
- Favorite removal and clear operations move focus to a remaining action or the empty-state link.
- Colorized player names expose one plain accessible name and hide decorative colored fragments.
- Subtle text and essential control boundaries meet their applicable contrast targets.
- No serious browser axe violations were found across the critical route matrix.

## Production bundle

`npm run build` generates a Vite manifest and fails when any checked gzip budget is exceeded.
The deployment workflow uses the same build command, so production cannot bypass the gate.

| Budget                                  |  Measured | Ceiling |
| --------------------------------------- | --------: | ------: |
| Initial JavaScript                      |  67.4 KiB |  75 KiB |
| Initial CSS                             |   4.9 KiB |   8 KiB |
| Largest transitive cold-route increment |  17.3 KiB |  30 KiB |
| Total JavaScript                        | 103.7 KiB | 115 KiB |
| Total CSS                               |  12.4 KiB |  16 KiB |

Routes are feature-grouped lazy imports with a loading state and a pathname-resetting error boundary.
The maps request hook is keyed and generation-guarded so source changes cannot display or mutate
stale data. Legacy prototype pages and production-only legacy/gallery CSS were removed.

## Commands

- `npm run verify` — formatting, lint, 30 Vitest files / 167 tests with coverage, strict
  TypeScript, production build, and performance budgets.
- `npm run test:e2e` — 27 Playwright tests across Chromium, Firefox, and WebKit.
- `git diff --check` — whitespace integrity.

CI installs all three pinned Playwright engines and their host dependencies before running the same
browser suite. Local WebKit validation on this host used equivalent libraries extracted under
`/tmp`; no system packages or production resources were changed.
