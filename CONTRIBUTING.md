# Contributing to CJS

Thank you for helping improve CodJumper Stats. Keep changes focused on a task in
[`docs/TASKS.md`](docs/TASKS.md) and discuss new product scope before implementing it.

## Before contributing code

The project is available under the [MIT License](LICENSE). By submitting a contribution, you agree
that your contribution may be distributed under those terms.

Never copy private implementation, proprietary assets, personal contact information, or attribution
from the reference site or another project. Only submit work you have the right to contribute.

## Development setup

Use Node.js 26 and npm 11:

```sh
nvm use
npm ci
npm run verify
```

For browser work, install the pinned Playwright engines and run the production-preview suite:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

The application must build from this repository alone. Do not add dependencies on sibling checkouts,
private services, local credentials, or the continued availability of the reference site.

## Engineering expectations

- Preserve strict TypeScript and validate unknown API payloads at the transport boundary.
- Keep source and filter state in the URL; persist only browser-local preferences.
- Handle loading, empty, error, success, cancellation, and refresh states deliberately.
- Use semantic HTML, visible keyboard focus, live status announcements, and shared design tokens.
- Consult the live API documentation and OpenAPI contract before changing an endpoint.
- Add focused unit/integration coverage and update critical browser flows when behavior changes.
- Record architecture, persistence, or runtime dependency decisions in `docs/adr/`.

## Pull requests

Create a branch and open a pull request against `main`. Keep one task or tightly coupled vertical
slice per pull request. Complete the pull request template, include screenshots for visual changes,
and call out release, migration, or owner-configuration impact explicitly.

`main` is protected. The stable required check is **Build and validate**; it runs formatting, lint,
tests with coverage, strict TypeScript, the production build, bundle/release artifact policies,
three-engine browser tests, and a Cloudflare dry run. Do not bypass branch protection or push
directly to `main`.

For vulnerabilities, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.
