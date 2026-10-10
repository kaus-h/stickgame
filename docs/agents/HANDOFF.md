# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-10, when Section 1 (levels 1-1 to 1-3) was built and the kit renderer landed._

## State

- **Main (51b9cc5):** game flow, saves, checkpoints, racing timing (GMR-103), death bodies (GMR-104), levels 1-1, 1-2 and 1-3, and the kit-based pen-sketch renderer (GMR-107). Exits have no speed limit (GMR-108).
- **Owner playtests** at `localhost:5173` from `D:\StickGame`. Keep that checkout on main and its dev server running.
- **Art direction (Decision Register 12):**
  - The 0014/0015 layered pen-sketch look, with thin lines.
  - Per-level themes may vary.
  - Inspirations: Jump King and Celeste.

## Open PRs

- None at handoff.

## In flight

- **Codex (ChatGPT desktop), queue in order:**
  1. GMR-106 goon e2e to exact-tick. It flakes on Chromium CI on nearly every PR.
  2. GMR-111: terrain connects to walls, floors and borders, with autotile-style edges. Includes the seamless ink pool and ledge-end contours.
  3. GMR-110: the eraser camera follows from the level start to the exit.
  4. GMR-109: patch inbox fixes. It doesn't format touched files, doesn't regenerate the schema validator, and once committed on the owner's main.
- **BrowserGPT (Chrome):** writing Linear doc **07B, Jump King and Celeste environment research**, in a "StickGame" project chat. When it lands, read only its translation and checklist sections. Then have BrowserGPT generate a fuller terrain kit (edges, inner and outer corners, wall-attached pieces, ceilings, background layers) in the reference chat, at GPT-6 High.

## Next (after the queue)

1. Review and merge Codex PRs: CI green, BrowserGPT verdict, then `D:\tmp\safe-merge.sh <n>`.
2. Terrain kit v2 from 07B, then a Codex task to render it.
3. GMR-56 visual language: anchor symbol, hazard and exit grammar. Wire the 0008 heads into the renderer (GMR-69 animation).
4. Section 2 levels (GMR-72..74) need moving-pivot design. Opus designs the chambers; Codex or a subagent runs the build/solve loop.
5. GMR-42 music direction (delegate research to BrowserGPT). GMR-31 core gate.

## Decisions this milestone (all in canon)

- Racing timing (Trackmania model). Respawn puts you at rest.
- A stale PB ghost is replaced by the next clear.
- Death bodies: render-only ragdolls, with an eraser sweep after completion.
- No exit speed limit.
- The art look as above. The owner's reference chat is allowed for art (07A amended).
- Device testing (GMR-33) is deferred until Chapter 1 is finished.

## Watch out

- **BrowserGPT and Muse** now run in the owner's real Chrome via Claude in Chrome. Downloads auto-save to `~/Downloads` and the inbox sweeps there. Always check the GPT-6 High effort slider; new chats can default to Medium.
- **Merging:** only via `D:\tmp\safe-merge.sh`. It requires the main `Check` job to exist and be green.
- **Computer use:** keep it to one-line messages to Codex, with no screenshots. Never try to control the Claude app window.
- **Inbox watcher:** must be running (`npm run inbox -- --watch`). It stopped once silently.
- **Muse** is primitive: give it only small, exact tasks of three files or fewer.
