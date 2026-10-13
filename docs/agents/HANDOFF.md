# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-13, after the camera framing, c6 slab and C6 climax PRs. **Owner direction: beauty first, optimization deferred. Opus builds visual, feel and level work hands-on.**_

## State

- **Camera (#89, owner-approved: less empty sky, no zoom, `minViewWidth` stays 23 m):**
  - `verticalBias` −1 → +1, so the hero sits nearer the middle of the frame;
  - lifted anchors clear the HUD band (`HUD_BAND_PX`);
  - the attention gate measures from the camera target;
  - `ATTENTION_EARLY` 4 m.
  - Fairness: every roped anchor is visible ≥ 34 ticks before the press (30 required).
  - c1/c2 keep their sky. The camera is pinned at the level's bottom bound there, so only level layout or sky content can change that.
- **c6 ceiling (#90):** not a rope surface (ropes attach only to anchors), and m6's skip runs above it. Wide floating slabs now get the ground's hatch mass and the ground top edge, a shaded underside, and irregular ink-bead drips. Evenly spaced ticks read as a ruler.
- **C6 climax (#91, this PR):**
  - the c6 pool rose from y 9 to y 8; a6b moved to (116, 3.2);
  - C6 measures 7 ticks on the a6a press (was 17), the tightest chamber, and ends in a short whip;
  - the camera no longer frames static anchors hidden behind terrain for the next 0.5 s (m6 was pulling the pool out of frame);
  - doc: `docs/levels/1-1-first-rope.md`.

## Open PRs and tasks

- **#91 (C6 climax and this handoff):** merge when every rollup conclusion is green.

## Next (GMR-114 golden 1-1, then the Level Factory)

1. **Owner checkpoint (batched, asked 2026-10-13).** Their answers go into memory.
   - Ear: re-voiced jump, invalid and taut cues, room tone, and the music arc.
   - Look: lamp strength, title card, spider, Mansalva.
   - New: the camera framing, the c6 slab, and whether C6 feels hard but fair.
2. **Level pass, remaining:**
   - c1/c2 sky (camera-pinned; consider sky content or layout);
   - C4 measures 13 ticks (target standard);
   - C5's solver uses a re-grab, not the intended single long rope;
   - check the m6 mastery skip still works by hand (no solver route covers it).
3. **Owner sign-off** on 1-1. Then the Level Factory: GMR-116 (authoring format) and GMR-117 (mechanic catalog). Then levels in batches.

## Workflow notes

- **Stills:** `npm run film:still -- <level> <tick[,tick…]> <out.png> [x,y,w,h] [WxH]`, for full-res film frames (installed Chrome). Tile them into one sheet and read it at ≤ 1500 px.
- **Film:** `npm run film -- 1-1 --from <chamber|tick> --ticks N --every K --scale 0.5`.
- **Route plot:** `npm run levels:plot -- 1-1 --x 88 126`. Rasterize with Playwright `setContent` (`goto file://` times out).
- **Solver:** `npm run levels:solve -- <id>` rewrites `content/solutions/<id>.json` and prints the tightest window per chamber.
- **Local e2e:** `E2E_PORT=5186 PW_CHANNEL=chrome npx playwright test <specs> --project=chromium`. Don't film alongside `npm run check`.
- **Merging:** merge only when every rollup conclusion is SUCCESS, SKIPPED or NEUTRAL. Re-query the rollup before merging.
- **CI "Check" includes the bundle budget.** Run `npm run bundle:report` locally after asset changes (1203/1220 KB).

## Watch out

- **Slim Phaser:** use canvas overlays and string blend modes, not `Phaser.*` runtime constants, in `src`.
- **`npm run check | grep … && git commit` masks failures.** Check the exit code.
- **No sun doodles** (owner, 2026-10-09). Dashes belong to the rope alone.
- **Windows Python rewrites LF as CRLF** when opening files in text mode. Pass `newline=''`.
