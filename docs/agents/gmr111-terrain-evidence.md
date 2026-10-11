# GMR-111 terrain evidence

Baseline: main `3ef1167`, including Opus's merged goon, eraser camera, inbox and GMR-107 polish changes. This branch adds render-only terrain connectivity. No simulation, collision, level content, golden replay or bundle budget changes.

## Repository checks

`npm run check` passed: typecheck, schema validation (15 levels, zero errors, four existing lab warnings), dependency lint, formatting, 62 unit files with 495 passing tests and three expected failures, and production build. `npm run bundle:report` passed with initial JS gzip 256.0 / 270.0 KB and total distribution 1038.6 / 1090.0 KB. Budgets are unchanged.

## Browser evidence

Final scoped runs on Chromium, Firefox and WebKit: **40 passed, 2 existing HMR writer skips**. The kit/terrain suite contributed 25 passes; checkpoint retry, PB ghost, physics/replay drift and eraser completion contributed 15. Chromium's ten-reload test keeps texture and camera counts equal to the first load. Temporary configurations used port 5195, strict port selection and two workers; they were removed afterwards.

Regression tests fail against the restored baseline renderer: floor contact ink was 0 (minimum 0.02), ceiling underside ink 0.00463 (minimum 0.01). The old finite outside strip also gave 0 ink below its end. Final tests pass for each case. See `docs/art/evidence/gmr111/regression-proof.json`.

The twelve before/after play and overview screenshots for 1-1, 1-2 and 1-3 are in `docs/art/evidence/gmr111/`. Capture manifests record actual level IDs, resources and fingerprints. Before and after fingerprints match: 1-1 `2857100c`, 1-2 `52e221e9`, 1-3 `a19dc448`. Replay hashes remain `718c6968` and moving-anchor `7e2af593`.

The geometry tests cover ten edge classification cases, including partial contacts, T-junctions, overlap, hazards, bounds, slopes, winding and short-edge tolerance. Five viewport layout tests cover full lower continuation, merged top columns, disjoint regions and offscreen bounds. Border output storage is bounded by viewport area; hidden Canvas outputs shrink to 1×1 and private TileSprite textures are removed on shutdown. Debug kit counts include these surfaces.

## Review and limits

Applied Linear doc 07B's translation section: topology only, thin doubled boundaries, inward hatching and paper majority; no copied art or level layouts. Full floating solids retain a thin underside contour. One-way physics, new backgrounds and the future 0017 kit remain outside this issue.

A Luna subagent reviewed geometry, camera routing/storage and shutdown cleanup without concrete findings. Owner art approval and physical-device/GPU verification remain pending. This is scoped browser evidence, not a claim that the entire E2E suite ran locally. Early development runs had navigation stalls; final scoped runs passed without increased retries or timeouts.
