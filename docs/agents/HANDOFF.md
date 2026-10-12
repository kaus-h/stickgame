# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-12 (evening), at the 300k-context handoff. **Owner direction: beauty first, optimization deferred. Opus builds visual, feel and level work hands-on.**_

## State

- **Main:** Living Notebook part 1 (#77) and the film tool (#80, `npm run film`, see `docs/film.md`).
- **#77 fixes that landed with it:**
  - E2E waits now expect **4 cameras** (paper, crisp, world, UI).
  - `kitPresentation().ready` now also waits for the 0.6 s draw-in.
  - The draw-in cover uses world-grid paper tiles, because a Phaser 4 Canvas TileSprite leaks its pattern texture on destroy.
  - Pencil shadows are cut out of the blocks, because the ground mass is open hatching.
- **#81** (a second GMR-115) was closed as a duplicate of #80, which another session merged first.
- **Owner playtests** at `localhost:5173` from `D:\StickGame`, on main. `gifenc` is installed there.

## Open PRs and tasks

- **#84 (GMR-114 part 1):**
  - margin doodles that react: birds on a wire scatter and settle, a sun watches the hero, clouds drift and stars spin;
  - ballpoint-coloured red ink pools.
  - Locally `npm run check` and 18 chromium e2e specs pass. `safe-merge.sh 84` was started; if it's not merged, check CI and merge.
- **Page-turn (GMR-114 part 2)** is with GPT-6.1 sol via `scripts/agents/codex-task.sh`:
  - branch `kaustavkalra123/gmr-114-exit-page-turn`, brief `D:/tmp/codex/briefs/gmr-114-page-turn.md`;
  - result `D:/tmp/codex/page-turn.result`, worktree `D:/tmp/codex/kaustavkalra123-gmr-114-exit-page-turn`.
  - Before merging, judge its `artifacts/film/page-turn-sheet.png`: does it read as a real page turning, drawn rather than glossy?
- **#82** (CI: Chromium on PRs) and **#83** (handoff = paste-ready prompt) belong to the other session's workflow work. Review and merge them if they're still open.

## Next (GMR-114 golden 1-1, then the Level Factory)

1. Merge #84, then review and merge the page-turn.
2. **Floating terrain that makes visual sense:** 1-1's `c6-ceiling` bar and `c7-roof` float with no support. Decide the treatment (taped paper strips? pencil hangers?). Collision stays authored.
3. **Feel pass:**
   - camera framing: the hero is small with a lot of empty sky above;
   - an audio cue on every verb;
   - the music arc across 1-1.
   - Ask the owner for feel notes first.
4. **Level pass:** every chamber reads at a glance, with the sawtooth per doc 14 §3a.
5. **Owner sign-off** on 1-1.
6. Then the Level Factory: GMR-116 (authoring format) and GMR-117 (mechanic catalog). Then levels in batches.

## Workflow notes

- **Look at motion cheaply:**
  - `npm run film -- 1-1 --from <chamber|tick> --ticks N --every K --scale 1`.
  - For native-size crops at chosen ticks, a ~40-line Playwright script works: vite on port 0, installed Chrome, `playReplay`, then screenshots with `clip`. View crops at native size and sheets downscaled to 800 px.
- **Local e2e without downloading browsers:** `E2E_PORT=5186 PW_CHANNEL=chrome npx playwright test --project=chromium <specs>`. Never use port 5173.
- **Parallel Opus subagents hit the usage limit** (two were lost mid-task). Use `codex-task.sh` (sol, a separate quota) for parallel modules; Opus keeps the taste work.
- **Another session may be working the same roadmap.** Run `gh pr list` (and ListAgents) before starting an item.

## Watch out

- **Slim Phaser:** filters exist on cameras, but helpers like `Color.IntegerToColor` don't. Use canvas overlays, not the Vignette filter. Don't write `Phaser.Textures.*` in `src`.
- **`npm run check | grep … && git commit` masks failures.** Check the exit code.
- **Muse is at muse.ai.** Inbox PRs are drafts (`gh pr ready`). Never put issue keys in PR titles.
