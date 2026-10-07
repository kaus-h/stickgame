# CI/CD and preview hosting (GMR-53)

Workflow: `.github/workflows/ci.yml`. Runs on every pull request (any base branch, since PRs are stacked) and on push to `main`. A newer push cancels the superseded run for the same PR or ref.

## What runs

| Job       | Steps                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check`   | `npm ci`, typecheck, `npm run lint` (ESLint + `lint:deps` layer boundaries), format check, `npm run test` (unit + conformance + stress), replay regression, build, bundle budget, upload `dist/` |
| `e2e`     | Playwright on chromium, firefox and webkit (one matrix job each, browsers cached per Playwright version). On failure the HTML report and traces are uploaded.                                    |
| `preview` | Optional Cloudflare Pages deploy plus PR comment. Skipped (with a note in the job summary) unless both Cloudflare secrets exist.                                                                 |

Replay drift in a real browser is covered by `tests/e2e/replay-drift.spec.ts` inside `e2e`; the unit side by `tests/unit/replay.test.ts` inside `check`.

## Build hash

`vite.config.ts` computes `<short SHA>-<8 hex of sha256 over content/ and src/>` and injects it as `__BUILD_HASH__`. `BUILD_HASH` in `src/core/build.ts` exposes it ('dev' outside a Vite build). Use it as `Replay.build` and in telemetry. The debug overlay shows it on its first line (`?debug` on any build).

## Bundle budgets

`budgets.json` (proposed, not canon; raise only with evidence): initial JS gzip 450 KB, total `dist/` excluding sourcemaps 1536 KB. `npm run build && npm run bundle:report` prints a table and exits non-zero when over budget; CI also writes it to the job summary.

## Previews

1. Always: every PR build is uploaded as workflow artifact `preview-<pr number>` (14 days). Download, unzip, serve with any static server.
2. Optional hosted preview (the repo is private, so GitHub Pages is not available on a free plan):
   - Create a Cloudflare account, then a Pages project named exactly `stickgame` (Direct Upload type).
   - Create an API token with the permission Account / Cloudflare Pages / Edit, and note the Account ID.
   - In GitHub, Settings > Secrets and variables > Actions, add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Next PR run deploys to branch alias `pr-<number>` and comments the URL. Same-repo PRs only (secrets are not exposed to forks).

## Making failing checks block merge

Settings > Branches (or Rules > Rulesets) > add a rule for `main`: require a pull request, require status checks `Check (typecheck, lint, layers, unit, build, budget)` and the three `E2E (...)` checks to pass, require branches up to date. On private repositories branch protection and rulesets require GitHub Pro (or Team); on the free plan they are not enforceable and the checks are advisory.
