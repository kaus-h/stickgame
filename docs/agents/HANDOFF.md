# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-12 (night), at the atmosphere milestone. **Owner direction: beauty first, optimization deferred. Opus builds visual, feel and level work hands-on.**_

## State

- **Main has the golden 1-1 look so far:**
  - margin doodles and ballpoint pools (#84);
  - the page turn (#86): sol's version, redrawn by Opus with the crease swinging toward the spine and pen-hatched curl and shadow;
  - atmosphere (#87): ink exit doorhouse, the Mansalva font, lamplight, graphite motes, the level title card, the lamplit front page, a spider in place of the sun, papery SFX and room tone.
- **Owner playtest notes (2026-10-12)**, all addressed in #87:
  - "the end shaft is low res";
  - "change the font completely";
  - "polished immersive atmospheric feel that hooks the player".
- **Font:** Mansalva is self-hosted. `loadHandFont()` loads only the WOFF file, because the dist budget is 1203/1220 KB. Fonts or assets that push past the budget need a budget raise (owner: optimization deferred) or a trim.
- **The lamp is off** under high contrast and with `?lamp=0`. Pixel-classifying e2e specs (terrain-connections, level-kit) use `?lamp=0`.
- **Owner playtests** at `localhost:5173` from `D:\StickGame`, on main.

## Open PRs and tasks

- **The PR after #87:**
  - pools get a lighter red wash so the ballpoint scribble reads as drawn ink;
  - the HUD gets a paper halo, so text stays legible over terrain;
  - this handoff.
  - Merge when green.

## Next (GMR-114 golden 1-1, then the Level Factory)

1. **Owner listens and looks:**
   - The audio changes are unheard: re-voiced jump, invalid and taut cues, plus a room tone at gain 0.07 on the music bus. Ask for ear notes.
   - Ask about lamp strength, the title card and the spider.
2. **Floating terrain:**
   - `c6-ceiling` (a 24 m bar at y −1.6, under the HUD) still reads as a bare bar. It may be a rope surface, so check before redrawing.
   - Options: hang it from the top border with drawn supports, or give it a torn-paper underside.
   - `c7-roof` now roofs the exit doorhouse.
3. **Feel pass:**
   - Camera: `minViewWidth` 23 m keeps rope-range anchors visible, so the hero stays small. Consider vertical framing (less empty sky) rather than zoom.
   - Music arc: check it by ear with the owner.
4. **Level pass:** every chamber reads at a glance; sawtooth pacing per doc 14 §3a.
5. **Owner sign-off** on 1-1. Then the Level Factory: GMR-116 (authoring format) and GMR-117 (mechanic catalog). Then levels in batches.

## Workflow notes

- **Look at motion cheaply:**
  - `npm run film -- 1-1 --from <chamber|tick> --ticks N --every K --scale 0.5`.
  - Scratch scripts that worked this session: Playwright with installed Chrome, a vite server on port 0, `page.clock.install()` and `runFor()` to step the page turn frame by frame.
  - In Git Bash, set `MSYS_NO_PATHCONV=1` when passing URL paths like `/?level=1-1`.
- **Local e2e:** `E2E_PORT=5186 PW_CHANNEL=chrome npx playwright test --project=chromium`. Don't run film captures alongside `npm run check`: load makes unit tests time out at 5 s.
- **Merging:**
  - Merge only when every rollup conclusion is SUCCESS, SKIPPED or NEUTRAL.
  - `gh pr checks --watch --fail-fast` can exit 0 while e2e is still pending. Re-query the rollup before merging.
- **CI "Check" includes the bundle budget** (`npm run bundle:report`), which the local `npm run check` does not run. Run it locally after asset changes.

## Watch out

- **Slim Phaser:** use canvas overlays and string blend modes (`'MULTIPLY'`), not `Phaser.*` runtime constants, in `src`.
- **`npm run check | grep … && git commit` masks failures.** Check the exit code.
- **No sun doodles** (owner, 2026-10-09). Dashes belong to the rope alone; the spider's silk is solid.
