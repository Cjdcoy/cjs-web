# ADR 0002: Locally bundled circular country flags

- **Status:** accepted
- **Date:** 2026-08-22

## Context

Leaderboard country markers must be compact, circular, and consistent across platforms. Unicode
flag emoji inherit platform artwork, including waving or folded treatments, and cannot guarantee a
flat circular presentation. Loading flag images from a public CDN would make the interface depend on
an unrelated runtime service.

## Decision

- Use `circle-flags` 2.8.3, a zero-dependency MIT-licensed collection of optimized circular SVGs.
- Emit its two-letter country SVGs into `dist/country-flags/` during the Vite build and serve the same
  package files through the local Vite development server.
- Render native `<img>` elements with empty alternative text inside the existing accessible country
  wrapper. Keep country names on that wrapper and use the existing Lucide globe when no valid
  two-letter country code is available.
- Keep flag URLs stable so repeated countries share browser-cached assets and no flag data is added to
  the JavaScript bundle.

## Consequences

Production remains self-contained and flag rendering is independent of operating-system emoji fonts.
The release includes roughly 1.1 MB of individually cacheable SVG assets, while each leaderboard row
downloads only its referenced flag and repeated countries reuse the same response. Package upgrades
must be reviewed for license, artwork, and country-code changes.
