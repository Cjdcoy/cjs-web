# Release and rollback runbook

Production is the Cloudflare Worker `cjs-web`. Merges to `main` are the normal release path. Do not
deploy, enable the deployment gate, dispatch the workflow, change dashboard routes/domains, or roll
back production without explicit repository-owner authorization.

## One-time owner configuration

1. Choose and publish a project license before accepting outside code contributions.
2. Configure the final HTTPS custom domain and route for `cjs-web` in the Cloudflare dashboard.
3. Add the repository variable `CJS_PRODUCTION_URL` as the custom-domain origin with no trailing path.
4. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the GitHub `production` environment.
   Scope the token to editing only the required Worker in the owning account.
5. Restrict the `production` environment to `main` and add required reviewers if the repository plan
   supports them.
6. Keep `CLOUDFLARE_DEPLOY_ENABLED=false` until the first release is approved.
7. Protect `main`: require a pull request, one approval, dismissal of stale reviews, approval of the
   latest push, and the strict **Build and validate** status check from GitHub Actions. Enable code
   owner review when more than one eligible owner exists.
8. Enable GitHub secret scanning, push protection, Dependabot security updates, and private
   vulnerability reporting.

The repository intentionally contains no `route`/`routes` entry, Worker binding, account ID, API
token, or custom domain. `workers_dev` and preview URLs remain disabled.

## Release checklist

1. Confirm the target commit is on `main`, CJS-015/CJS-016 are complete, and no unrelated local
   changes are part of the release.
2. Review dependency alerts and run:

   ```sh
   npm ci
   npm run verify
   npx playwright install --with-deps chromium firefox webkit
   npm run test:e2e
   npm run deploy:dry-run
   ```

3. Review `dist/`: `_headers` and `.assetsignore` must exist; no `.map`, environment, credential, or
   private artifact may be present.
4. Confirm `CJS_PRODUCTION_URL`, the two Cloudflare environment secrets, the dashboard custom domain,
   and production environment protection.
5. Obtain explicit owner approval. Set `CLOUDFLARE_DEPLOY_ENABLED=true` only when ongoing
   merge-to-production releases are intended.
6. Merge through the protected branch. The deploy workflow starts only after CI succeeds for the
   exact `main` commit, rebuilds, dry-runs, deploys with Wrangler strict mode, and checks public SPA
   routes, security headers, and immutable asset caching.
7. Watch both workflows through completion. Verify the configured production origin manually at `/`,
   `/leaderboards`, `/maps`, `/players`, `/favorites`, and `/about`.

An explicitly authorized manual run uses:

```sh
gh workflow run deploy-cloudflare-worker.yml --ref main --repo Cjdcoy/cjs-web
```

## Rollback

A rollback is a production mutation and requires explicit owner authorization.

1. Identify the last known-good version in Cloudflare **Workers & Pages → cjs-web → Deployments** or
   with `npx --yes wrangler@4.114.0 deployments list --config wrangler.jsonc`.
2. Record the incident, bad commit/deployment, chosen version ID, and reason for rollback.
3. Roll back through the Cloudflare dashboard, or run this only after approval:

   ```sh
   npx --yes wrangler@4.114.0 rollback VERSION_ID --config wrangler.jsonc --message "Rollback: REASON"
   ```

4. Run the production smoke checks using `CJS_PRODUCTION_URL=https://… npm run smoke:production` and
   verify the affected user flow.
5. Set `CLOUDFLARE_DEPLOY_ENABLED=false` if further merges must not deploy. Revert or fix the source
   change through a pull request; do not treat the Cloudflare rollback as repository history.

Cloudflare rollbacks immediately activate the selected version at 100% traffic and do not revert
external resources or dashboard configuration. CJS currently has no Worker bindings, which keeps the
rollback boundary limited to static assets and Worker version metadata.
