# Security policy

## Supported version

CJS is pre-1.0. Only the current `main` branch and the active production deployment receive security
fixes. Older commits and locally modified forks are not supported release lines.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/Cjdcoy/cjs-web/security/advisories/new>

Do not open a public issue for a suspected vulnerability. Include the affected route or component,
impact, reproduction steps, and a minimal proof of concept. Never include real credentials, player
identifying payloads, or unrelated private data.

The maintainer will acknowledge a usable report when available, assess its severity, and coordinate
remediation and disclosure through the private advisory. No response-time or bounty commitment is
offered.

## Scope

Reports about this frontend, its browser-local favorites, build/release pipeline, and the `cjs-web`
Cloudflare Worker are in scope. API availability or data correctness issues belong to the separately
operated CJ Stats API unless the CJS client creates the security impact.
