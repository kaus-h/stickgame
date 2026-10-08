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

`budgets.json` (proposed, not canon; raise only with evidence): initial JS gzip 235 KB, total `dist/` excluding sourcemaps 940 KB. GMR-99 measured 204.3 KB and 816.8 KB after the slim Phaser build and added ~15% headroom; before it the numbers were 374.4 KB and 1472.1 KB against budgets of 450 KB and 1536 KB. `npm run build && npm run bundle:report` prints a table and exits non-zero when over budget; CI also writes it to the job summary.

### Slim Phaser build (GMR-99)

The game does not ship Phaser's full prebuilt bundle (`phaser/dist/phaser.esm.js`). `vendor/phaser-custom.js` is an ESM entry over Phaser's CommonJS `src/` that exports only what `src/` uses at runtime: `Game`, `Scene`, `Scale`, `Cameras.Scene2D`, `GameObjects` (`GameObject`, `Graphics`, `Text`, `TileSprite`, `RenderTexture`) and the root constants (`AUTO`, `CANVAS`, ...). `scripts/build-phaser.mjs` bundles it with Rolldown (Vite's bundler) into `vendor/.build/phaser.mjs`, which is generated and git-ignored. It replaces Phaser's compile-time flags the way Phaser's own webpack configs do: `CANVAS_RENDERER` and `WEBGL_RENDERER` on; `WEBGL_DEBUG`, `EXPERIMENTAL`, `PLUGIN_3D`, `PLUGIN_CAMERA3D`, `PLUGIN_FBINSTANT` and `FEATURE_SOUND` off. A plugin in `vite.config.ts` rebuilds the bundle when the entry, the script or the Phaser version changes, and aliases `phaser` to it for the dev server, builds and e2e alike, so tests run the engine that ships. TypeScript still reads the full `phaser` package types. `node scripts/build-phaser.mjs` forces a rebuild.

Cut: Physics (Arcade and Matter), Tilemaps, Sound (`game.sound` is `null`; our audio is `src/audio`), Tweens (`scene.tweens`), Loader (`scene.load`), the Data plugin (`scene.data`), the Lights plugin, Gamepad, camera controls, the Actions, Curves, Geom, Math, DOM, Display, Filters and Animations namespace roots, and every Game Object and `scene.add.*` factory except Graphics, Text, TileSprite and RenderTexture. Engine internals still pull in parts of these (texture and animation managers, both renderers, math helpers); only unused roots and self-registering plugins are gone.

To re-add a Phaser system:

1. Find what registers it in `node_modules/phaser/src`: the matching `index.js`, a `*Factory.js` for `scene.add.*`, or a `PluginCache.register` / `InputPluginCache.register` call for scene plugins.
2. Import it in `vendor/phaser-custom.js`: a side-effect import for factories and plugins, plus an export if code uses it as `Phaser.X` at runtime. For sound, set `FEATURE_SOUND: true` in `scripts/build-phaser.mjs`.
3. Restart `npm run dev` (the bundle rebuilds itself), then run `npm run build && npm run bundle:report`. Budgets go up only with evidence.

Missing pieces type-check but are `undefined` at runtime (`scene.tweens`, `scene.load`, an unexported `Phaser.X`), so a new feature fails on first use rather than silently.

## Previews

1. Always: every PR build is uploaded as workflow artifact `preview-<pr number>` (14 days). Download, unzip, serve with any static server.
2. Optional hosted preview (the repo is private, so GitHub Pages is not available on a free plan):
   - Create a Cloudflare account, then a Pages project named exactly `stickgame` (Direct Upload type).
   - Create an API token with the permission Account / Cloudflare Pages / Edit, and note the Account ID.
   - In GitHub, Settings > Secrets and variables > Actions, add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Next PR run deploys to branch alias `pr-<number>` and comments the URL. Same-repo PRs only (secrets are not exposed to forks).

## Making failing checks block merge

Settings > Branches (or Rules > Rulesets) > add a rule for `main`: require a pull request, require status checks `Check (typecheck, lint, layers, unit, build, budget)` and the three `E2E (...)` checks to pass, require branches up to date. On private repositories branch protection and rulesets require GitHub Pro (or Team); on the free plan they are not enforceable and the checks are advisory.
