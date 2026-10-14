# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-14 (second session of the day), at the 400k context handoff._

## State

- **Landed today:**
  - GMR-120: world-style plumbing (#96)
  - GMR-119: swing-impact targets and `lab-impact` (#99)
  - Music remix toward "cyberpunk future whimsy", unheard by Opus (#98)
  - Bundle total budget raised to 1350 KB (#101)
  - World bible draft `docs/art/worlds.md` and round-2 concept frames `assets/concepts/0018-worlds/` (#100)
  - `scripts/agents/safe-merge.sh` (#100). **Always merge with it.** A hand gate once merged #99 before CI ran.
- **Canon:** Linear docs 03, 04, 05, 08 and 12 cover Targeting v2 and combat = swing impacts + stomps (no attack button, ever).
- **Owner said "you decide":**
  - **Chapter order:** The Mark (pencil) → The Cut (paper) → The Wash (paint) → The Signal (neon) → The Upload (inside the machine).
  - **Concept picks:** chapter 1 = `pencil.jpg`, chapter 5 = `digital-b.jpg`.
  - `digital.jpg` is rejected: desktop windows and a cursor are on the AvA do-not-copy list.
  - The owner has not yet seen the pencil build or heard the remix.
- **Stash:** the dark-lamp WIP was dropped (owner OK).

## In flight (check first)

- **#102, chapter 1 pencil world** (`opus/pencil-world-ch1`, worktree `D:/tmp/wt/pencil`):
  - 1-1, 1-2, 1-3 and 2-1 are set to `world: pencil`. `?world=notebook` gives A/B.
  - Notebook e2e specs are pinned to `?world=notebook`; `tests/e2e/pencil-world.spec.ts` is new.
  - Merge with `safe-merge.sh 102` once CI is green.
  - Known shortfalls: terrain silhouettes are still blocky because the level geometry is rectangles (a redesign task), hatching is a bit uniform, cloud streaks run horizontal.
  - Unverified: phone memory (estimated 9–11 MB per level), high contrast.
- **#97, GMR-118 Targeting v2:**
  - Finished by a Sonnet agent after sol hit its usage limit. Main was merged in and `npm run check` passes.
  - The route solver now vetoes camera-unfair presses (`camera-fair.ts`). Every fixture is re-solved, the level13 proofs re-derived by inputs, and the device-lab golden hashes updated.
  - Lessons hold: in 1-1 C5 the run-off still dies and the early jump survives (inputs re-timed, no geometry change).
  - Merge after #102 (re-merge main if it conflicts), then `safe-merge.sh 97`.
  - Then run a hands-on feel check of the highlight on mouse and pad. Mobile tap vs. Rope button is still PROTOTYPE REQUIRED.

## Next

1. Merge #102, then #97. Update the owner's checkout (`git pull` in `D:/StickGame`) and the preview (`git -C D:/tmp/wt/preview-main checkout --detach origin/main`, port 5191).
2. **Owner checkpoint (batch):**
   - play the pencil chapter 1 (A/B with `?world=notebook`);
   - listen to the music remix;
   - try Targeting v2;
   - answer the 4 open questions in `docs/art/worlds.md`, mainly: may a phased anchor pre-pulse its appearance?
3. **1-1 terrain redesign in the pencil style:** organic silhouettes in level geometry (overhangs, ledges with lips, rock spires), keeping every lesson pinned (`level11.test.ts`). This is Opus's own level work.
4. **Level Factory:** GMR-116 (authoring format; the world field now exists) and GMR-117 (mechanic catalog).
5. Once the owner confirms the bible, fold it into 07A, doc 14 and the `world-look-decision` memory.
6. A first boss prototype on GMR-119 impact targets (three hits, three arena states).

## Workflow notes

- **sol (Codex CLI):** always `CODEX_SANDBOX=bypass`. Judge runs by the branch commit, not the result file. The quota ran out 2026-10-14; fall back to Sonnet subagents for mechanical work.
- **Stills:** `npm run film:still -- <level> <ticks> <out.png>`. Make contact sheets of at most 1500 px. Never Read a full-resolution PNG in the main thread.
- **Local e2e:** `E2E_PORT=5197 PW_CHANNEL=chrome npx playwright test <spec>`. Never use :5173.
- **Combined PRs can bust budgets** even when each passed alone. Re-check main CI after merging several.

## Watch out

- Slim Phaser: no `Phaser.*` runtime constants in render code.
- Red always means lethal. The rope alone is dashed. No sun. No real desk objects. No evenly spaced marks.
- Windows Python: `newline=''`, and no non-ASCII output on cp1252.
