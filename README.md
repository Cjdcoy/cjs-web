# CJS — CodJumper Stats

CJS is a public, frontend-only website for exploring live servers, leaderboards,
maps, runs, and players across the JumpersHeaven and Jump4Life communities. It
uses the public [CJ Stats API](https://api.jump4life.org/docs).

The application is an independent React/TypeScript/Vite implementation with a
tested, feature-oriented architecture and authored design system.

Planning documents:

- [Project plan](docs/PROJECT_PLAN.md) — product scope, architecture, design
  direction, quality bar, and delivery strategy.
- [Task backlog](docs/TASKS.md) — dependency-ordered work packages for future
  agents.
- [Agent guidance](AGENTS.md) — mandatory engineering and safety rules.
- [Contribution guide](CONTRIBUTING.md) — local setup, checks, and pull request
  expectations.
- [Security policy](SECURITY.md) — supported scope and private reporting path.
- [Release runbook](docs/RELEASE.md) — owner-only production setup, release, and
  rollback procedures.

## Development

Start the Docker-based development server:

```sh
mise run dev
```

The site will be available at http://localhost:5173. Run `mise run help` to see the other Docker-based tasks.

To run the app directly on the host instead:

```sh
nvm use
npm ci
npm run dev
```

Host development requires Node.js 26 and npm 11. The Docker workflow uses the
same Node.js major version.

The site reads live data from the separately deployed CJ Stats API and defaults
to `https://api.jump4life.org`.

Copy the example environment file to override that default:

```sh
cp .env.example .env
```

The supported setting is `VITE_API_BASE_URL`.

## Product routes

- `/` live servers
- `/leaderboards`
- `/maps` and `/maps/:mapId`
- `/players` and `/players/:playerId`
- `/about`
- `/favorites` (stored locally in the browser)

Shareable filters are represented in the URL, and JumpersHeaven and Jump4Life
remain explicit data sources. COD4 is a future capability and is not advertised
until the API contract supports it.

## Validation and deployment

Run the complete local quality gate with either `mise run verify` or:

```sh
npm run verify
```

The gate checks formatting, lint rules, strict TypeScript compilation, the test
suite with coverage, and the Vite production build. Individual checks are also
available through `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run test:coverage`. Use `npm run format` to apply the shared
formatting rules. The generated static site is written to `dist/`.

Install the pinned browser engines once, then run the production-preview browser matrix:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

The browser suite covers Chromium, Firefox, and WebKit with strict API mocks, critical flows,
accessibility scans, console-error checks, small-screen reflow, reduced motion, and a 200% scale
equivalent. See [the CJS-015 validation record](docs/CJS-015-VALIDATION.md) for the current matrix and
bundle measurements.

GitHub Actions installs the locked dependencies, runs `npm run verify`, executes
the three-browser E2E matrix, and validates a Cloudflare dry run for every pull
request and push to `main`. The stable required check is named
`Build and validate`. A separate, disabled-by-default workflow can publish the
exact successful `main` revision as the `cjs-web` Cloudflare Worker.

Configure the deployment workflow with:

- Production environment secret `CLOUDFLARE_API_TOKEN`: a token scoped to the account with the `Edit Cloudflare Workers` policy.
- Production environment secret `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns the Worker.
- Repository variable `CJS_PRODUCTION_URL`: the HTTPS custom-domain origin used
  for the post-deploy smoke test.
- Repository variable `CLOUDFLARE_DEPLOY_ENABLED`: set to `true` only after the secrets and production route are configured.

Custom domains and routes remain managed in the Cloudflare dashboard. `wrangler.jsonc` intentionally omits route keys and disables `workers.dev` and preview URLs so deployments do not replace dashboard-managed routing settings.
See [the release runbook](docs/RELEASE.md) before changing the deployment gate.

The `static` Docker target builds the app and serves the SPA with nginx:

```sh
docker build --target static -t cjs-web .
```

Set `VITE_API_BASE_URL` as a build argument when deploying against a different API instance.

To smoke-test direct loading of every current SPA route, start the static image:

```sh
docker build --target static -t cjs-web .
docker run --rm --name cjs-web-smoke -p 8080:80 cjs-web
```

Then run this in another terminal:

```sh
for route in / /leaderboards /maps /players /about /favorites; do
  curl -fsS "http://127.0.0.1:8080$route" >/dev/null || exit 1
done
```

Stop the foreground container with <kbd>Ctrl</kbd>+<kbd>C</kbd> after the check.

## License

CJS is available under the [MIT License](LICENSE). The map-card screenshots in
`public/maps/cards` were captured and prepared by Cjdcoy and are included under the same license.
Third-party dependencies and underlying game or map content retain their respective rights.
