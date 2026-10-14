# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-13, after the owner's second checkpoint and the 1-1 level pass (#92, #93). **Owner direction: beauty first; later levels lean on puzzles and timing, not mechanical skill.**_

## State

- **Owner checkpoint answers (in memory, `owner-answers-2026-10-13`):** music is liked; the camera and C6 are approved; the spider and Mansalva are in; "keep expanding aesthetics".
- **#92, acting on those answers:**
  - The section-clear sting is now a chord-aware chime arpeggio over a pad bloom. Contour and rhythm vary per chamber and bar, the register climbs through the level, and the exit resolves to the tonic.
  - The lamp is a touch darker at the edges, with the centre unchanged.
- **#93, the level pass:**
  - **C4:** the pool rose from 8.3 to 7.8, so ground-connected ropes now die (the lesson never bit before).
  - **C5:** the taught single long rope is measured and pinned.
  - **Tests:** both lessons, and the mistakes they correct, are in `tests/unit/level11.test.ts`.
  - **m6 removed:** it was physically unreachable.
  - **C6:** its region starts on the ledge (x 92).
  - **Camera:** look-ahead points behind terrain no longer frame hidden anchors.
  - **Spider:** it waits above the title card.
  - Measurements and decisions are in `docs/levels/1-1-first-rope.md`.

## Open PRs and tasks

- None after #93 merges. No Codex or inbox work is in flight. Old worktrees remain (`.claude/worktrees/*`, `D:/tmp/codex/*`, `D:/tmp/wt/atmos`); clean them up only if the owner asks.

## Next

1. **Owner checkpoint (batch these):**
   - Play 1-1 for the new C4: does "connect on the ground → ink" read as a fair lesson?
   - Does C5's jump-early idea land?
   - Ear: does the varied sting feel smoother?
   - Eye: is the lamp right?
   - 1-1 sign-off.
2. **Level Factory:** GMR-116 (authoring format) and GMR-117 (mechanic catalog). Design for puzzle and timing reads: a taught route plus a pinned mistake per chamber, as in `level11.test.ts`.
3. Then levels in batches (1-2 is the quality bar; see the `level-design-feedback` memory).
4. **Aesthetics backlog (owner: keep expanding):** ink stains and meniscus where pools meet walls (subtle at play scale), more varied terrain silhouettes, and richer sky life in open chambers.

## Workflow notes

- **Stills:** `npm run film:still -- <level> <tick[,tick…]> <out.png> [x,y,w,h] [WxH]`. Tile them into one sheet and read it at ≤ 1500 px.
- **Hand routes:** the solver's `World` + `PlanSource` (from `node_modules/.cache/route-solver/solver.mjs`, built by `levels:solve`). Fork from a committed replay state and run hand plans. This is how C4/C5/m6 were measured.
- **Solver:** `npm run levels:solve -- <id>`. It proves _a_ route; taught routes need their own tests. A chamber's region must start where its take-off run starts.
- **Local e2e:** `E2E_PORT=5186 PW_CHANNEL=chrome npx playwright test <specs> --project=chromium`.
- **Merging:** only when every rollup conclusion is SUCCESS, SKIPPED or NEUTRAL.
- **CI "Check" includes the bundle budget** (1203/1220 KB). Run `npm run bundle:report` after asset changes.

## Watch out

- **Slim Phaser:** use canvas overlays and string blend modes, not `Phaser.*` runtime constants.
- **`npm run check | grep … && git commit` masks failures.** Check the exit code.
- **No sun doodles.** Dashes belong to the rope alone.
- **Windows Python:** pass `newline=''` (it rewrites CRLF otherwise), and don't print non-ASCII to a cp1252 console. A failed script piped into `gh pr edit --body-file` blanks the PR body.
