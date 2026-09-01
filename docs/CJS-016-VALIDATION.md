# CJS-016 validation record

Date: 2026-08-15

## Release boundary

- The public repository is protected by the strict **Build and validate** status check, one approving
  review, stale-review dismissal, and approval of the latest push.
- The `production` environment accepts deployments from `main` only.
- `CLOUDFLARE_DEPLOY_ENABLED` remains `false`; `CJS_PRODUCTION_URL` is intentionally unset pending
  the owner's custom-domain decision.
- Private vulnerability reporting, secret scanning, push protection, and Dependabot security
  updates are enabled.
- At validation time, the repository did not publish a license and prohibited accepting outside
  code until the owner chose one.

No production workflow was dispatched, no Cloudflare route/domain/binding was changed, and no
credential was retrieved during this work.

Post-validation update (2026-08-30): the owner selected the MIT License. The root `LICENSE`, package
metadata, README, contribution guide, and release runbook now publish that decision.

## Automated validation

| Check                                          | Result                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Isolated source copy: `npm ci`                 | Pass; 443 locked packages installed without repository secrets or sibling repositories                                        |
| Isolated source copy: `npm run verify`         | Pass; formatting, lint, 30 Vitest files / 167 tests, strict TypeScript, production build, bundle budgets, and artifact policy |
| `npm audit --audit-level=high`                 | Pass; zero vulnerabilities reported                                                                                           |
| `npm run deploy:dry-run` with Wrangler 4.114.0 | Pass; 30 asset inputs read, no bindings, dry-run exit without deployment                                                      |
| Synthetic release configuration validation     | Pass for an HTTPS custom-domain origin, secret-presence flags, and exact 40-character revision                                |
| GitHub workflow lint (`actionlint`)            | Pass                                                                                                                          |
| Source-tree secret scan (`gitleaks`, redacted) | Pass; approximately 695 KB scanned, no leaks found                                                                            |
| Static Docker image build and `nginx -t`       | Pass                                                                                                                          |
| nginx nested route `/players/501`              | HTTP 200 SPA fallback with revalidation and security headers                                                                  |
| nginx fingerprinted CSS asset                  | HTTP 200 with `public, max-age=31536000, immutable` and security headers                                                      |

The release artifact check inspected 28 generated files and rejected source maps, source-map
references, sensitive configuration names, missing security policy files, and missing build-metadata
exclusions. Vite source maps are explicitly disabled.

## Browser check note

The local browser run passed all 18 Chromium and Firefox tests. The nine WebKit cases could not
launch in this host because Playwright's MiniBrowser lacked the system `libevent-2.1.so.7` library;
the failure occurred before application code ran. CI installs Playwright's declared operating-system
dependencies before running all 27 tests. The last CJS-015 three-engine validation passed all 27
tests; the CJS-016 changes do not alter application behavior.

## Owner actions before first public release

1. Resolved 2026-08-30: publish the repository under the MIT License before accepting outside
   contributions.
2. Choose the final HTTPS custom domain in Cloudflare and set `CJS_PRODUCTION_URL` to its origin.
3. Confirm the least-privilege Cloudflare production secrets and, if desired, add a production
   environment reviewer.
4. Explicitly approve the first release and enable `CLOUDFLARE_DEPLOY_ENABLED`; then observe CI,
   deployment, and the post-deploy public smoke test through completion.
