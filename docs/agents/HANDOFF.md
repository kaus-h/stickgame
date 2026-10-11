# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-11, after merging the Codex queue (GMR-106, 110, 107 polish, 109) and approving the terrain kit v2 art._

## State

- **Main (90590f9):** game flow, saves, checkpoints, racing timing (GMR-103), death bodies (GMR-104), levels 1-1, 1-2 and 1-3, and the kit-based pen-sketch renderer (GMR-107, plus pool-seam polish). Exits have no speed limit (GMR-108). Goon e2e is deterministic (GMR-106). The eraser camera follows the sweep (GMR-110). The inbox works in isolated worktrees and formats and regenerates files (GMR-109).
- **Owner playtests** at `localhost:5173` from `D:\StickGame`. Keep that checkout on main and its dev server running.
- **Art direction (Decision Register 12):**
  - The 0014/0015 layered pen-sketch look, with thin lines.
  - Per-level themes may vary.
  - Inspirations: Jump King and Celeste.

## Open PRs

- None at handoff.

## In flight

- **Codex (ChatGPT desktop):** working on GMR-111 (terrain autotile edges) in `.claude/worktrees/gmr111`. Next: **GMR-112, terrain kit v2 (kit 0017)**, which is blocked by GMR-111. The source sheets are in `D:\tmp\kit-v2\` (sheet A terrain, sheet B pools and backgrounds), both approved by Opus. Scheduled runs can't drive the ChatGPT app with computer use, so the owner or an interactive session must pass GMR-112 to Codex.
- **07B** is in Linear. Kit v2 scope ruling: T01–T23, T25–T28, T34–T42. One-way T29–T31 is out (no one-way physics in canon). Spikes and fangs T24, T32, T33 go to GMR-56.

## Next

1. Review and merge GMR-111, then GMR-112 (CI green, BrowserGPT verdict, `D:\tmp\safe-merge.sh <n>`).
2. GMR-56 visual language: anchor symbol, hazard grammar (including 07B spikes) and exit grammar. Wire the 0008 heads into the renderer (GMR-69 animation).
3. Section 2 levels (GMR-72..74) need moving-pivot design. Opus designs the chambers; Codex or a subagent runs the build/solve loop.
4. GMR-42 music direction (delegate research to BrowserGPT). GMR-31 core gate.

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
- **Inbox watcher:** must be running (`npm run inbox -- --watch`), exactly one instance. On 2026-10-11 two were running; restart it after inbox code changes.
- **Local `npm run check`** fails on an unformatted untracked `.claude/launch.json`. Run Prettier on it, since it isn't in the repo.
- **Muse** is primitive: give it only small, exact tasks of three files or fewer.
