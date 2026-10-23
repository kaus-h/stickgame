# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-23, at the context handoff._

## State

- **Landed since 10-14:**
  - #104: touch e2e fixed for the default Rope-button scheme (main went red after #97).
  - #105: 1-1 terrain masses are organic polygons (tops and a 0.9 m lip exact; flanks only cut inward).
  - #106 → reverted by #107: a notebook-vista experiment; the owner prefers the pencil 1-1.
  - #107: pencil 1-1 kept; sketchbook paper now has 0.5 m notebook ruling; hero head WebPs re-cut with real alpha (the white box around the head).
  - This branch (`opus/1-1-steady-camera-polish`): vertical camera hold (`holdVertical`, used by GameScene and the solver's camera-fair), vista layers 1:1 horizontally and screen-fixed vertically, light shafts removed, top-band fix.
- **Owner rulings 2026-10-23** (also in memory `owner-answers-2026-10-23`):
  - Chapter 1 stays pencil, with notebook lines behind it.
  - Backdrop: no parallax, no vertical motion at all; it just scrolls by with horizontal progress.
  - No spotlight/light shafts.
  - The camera must not bob on jumps (Mario/Celeste hold).
  - "Polish this game, it's so ugly right now": the bar is high; polish is the priority.
- The owner's dev window is about 4:3 (1142×850). At 4:3 the whole level height fits, so check every visual change at 4:3 as well as 16:9.

## In flight (check first)

- The branch above: if not merged, run `npm run check`, related e2e (`pencil-world`, `kit-0017`, `level-kit`, `terrain-connections`), then `safe-merge.sh`.

## Next

1. **Polish pass on 1-1 (Opus hands-on, use an Opus subagent for still loops):** backdrop composition at 4:3 and 16:9 (the far landmarks are busy, and the mist is flat grey); terrain hatching too uniform; red ink edge; HUD legibility. Show the owner a 4:3 contact sheet before merging big look changes.
2. Owner checkpoint: play 1-1 and confirm the camera hold and the static backdrop.
3. Then the 1-2 and 1-3 look in the same style, and Level Factory (GMR-116/117).
4. The worlds.md open questions are still unanswered (order, phased-anchor pre-pulse, The Correction).

## Workflow notes

- **Stills:** `npm run film:still -- <level> <ticks> <out.png> "" <WxH> [query]`. Contact sheets ≤1500 px. The browser pane's viewport emulation renders the game wrongly; use film stills for sizes.
- The browser pane's save had High contrast on, which hides the vista; it is off now.
- `tests/unit/kit17-assets.test.ts` times out (5 s) under full-suite load on this machine; it passes alone and in CI.
- sol quota ran out 10-14; use Sonnet/Opus subagents.
- Always merge with `scripts/agents/safe-merge.sh <PR>`.

## Watch out

- Slim Phaser: no `Phaser.*` runtime constants in render code.
- Red always means lethal. The rope alone is dashed. No sun. No real desk objects. No evenly spaced marks.
- Windows Python: `newline=''`, and no non-ASCII output on cp1252.
