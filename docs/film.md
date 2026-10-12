# Gameplay capture (GMR-115)

```bash
npm run film -- 1-1
npm run film -- 1-1 --from 1-1-c2 --ticks 240 --every 4 --scale 0.5
npm run film -- lab-authoring --from 60 --ticks 180
```

Install dependencies with `npm install`. If Chromium is missing, run
`npx playwright install chromium`. A level needs a full, solved route in
`content/solutions/<level-id>.json`; create one with `npm run levels:solve -- <level-id>`.
The command verifies it against the current level and simulation before capturing. Missing,
unsolved or stale routes fail with a diagnostic. Chapter levels and labs use the same path.

Outputs overwrite `artifacts/film/<level-id>.gif` and `<level-id>-sheet.png` (ignored by Git).
The GIF loops; the sheet contains up to 16 evenly spaced frames with tick labels, including
the first and last frame. Short clips with fewer frames use all available frames. Sheets are
at most 1600 px wide, with 24 px labels readable at 50% zoom.

- `--from`: an exact chamber id from the solution, or a non-negative absolute simulation tick.
  Earlier inputs and renderer updates still run from spawn, so the camera and effects have history.
- `--ticks`: capture duration in simulation ticks, clamped to the end of the route. Default: all
  remaining ticks. A full capture includes the final route tick, even off the sampling interval.
- `--every`: positive integer sample interval, default 4 (15 fps at 60 Hz).
- `--scale`: output scale relative to a 960 × 540 game viewport, default 0.5; range `(0, 1]`.

The CLI starts its own Vite dev server on an OS-allocated loopback port and closes it and
Chromium on completion, failure or interruption. It does not use or stop other checkouts' servers.
Clear any stale Node server for this worktree before starting a new one.

The dev-only `?film` composition loads the same assets and `GameScene` as the game. Its
`FilmSession` reuses the GMR-29 fixture and recorded-input replay path. Phaser's automatic loop
stops after scene initialization; the CLI hook steps the real simulation once per tick and calls
the real renderer with a fixed 1/60 s delta. Capture is by tick, with no wall-clock sleeps or
screen recording. Every captured state hash is compared to a Node replay. No gameplay changes,
auto-player logic, save writes or simulation time manipulation are involved.

`gifenc` is a small, pure JavaScript devDependency with no native executable. Its palette
quantization suits the game's flat ink art. It runs only in the Node script; the existing `pngjs`
dependency decodes captures. The browser composition is behind `import.meta.env.DEV`, so the
film import and hook are removed from production builds. Bundle budgets are unchanged.

Captures are capped at 600 frames by evenly thinning the selected ticks while retaining both
endpoints. If the encoded GIF exceeds 8 MiB, it is thinned again. Tick-based delays preserve the
route's duration; the final frame holds for half a second. GIF delays have 10 ms precision, so
4-tick samples alternate 60/70 ms. Thinning can make long routes less smooth; use `--from` and
`--ticks` for detailed review of a chamber. Clips ending before the route finishes show a partial run.

Unit tests cover frame selection, grid layout, CLI ranges and deterministic replay. Run
`npm run check` for repository validation and `npm run film -- 1-1` to verify actual capture.
