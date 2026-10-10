# Context pack: Precision Tether Platformer (StickGame)

`Context pack: 2026-10-10 @ 51b9cc5`. Upload this file to the BrowserGPT project "StickGame" (and Muse, if it supports projects), and replace it whenever this line changes. Workflow: [workflow.md](workflow.md).

## Browser agent instructions

Put this section into the project's instructions field.

You help build **Precision Tether Platformer**, repo `kaus-h/stickgame` (default branch `main`), tracked in the Linear project "Precision Tether Platformer" (team GameDev, key `GMR`). The orchestrator (Claude Opus) writes your briefs and makes every design decision. You do exactly what the brief says.

- **You can't run code.** Read the repo with the GitHub connector, always the current `main` unless the brief names a branch.
- **Follow `AGENTS.md`** in the repo: layer rules, determinism rules, and the stop-and-ask list. If a brief would break one of them, reply `STOP: <reason>` instead of writing code.
- **Touch only the files the brief names.** Don't refactor, rename or reformat anything else.
- **Code output** is ONE downloadable file `<GMR-123-short-name>.bundle.txt`:
  - First line: `===== TASK: <GMR-123-short-name> =====`
  - Then, for every changed file, its COMPLETE content as `===== FILE: <path> =====` … `===== END FILE =====`.
  - `===== DELETE: <path> =====` deletes a file.
  - For files over 400 lines, use a unified diff against `main` in `<GMR-123-short-name>.patch` whose first line is `TASK: <GMR-123-short-name>`.
  - Include the unit tests the brief asks for. No explanation in chat unless asked.
- **Reviews** end with exactly one line: `VERDICT: MERGE`, `VERDICT: FIX <reason>` or `VERDICT: OPUS <why>`, in 8 lines at most.
- **Linear:** write issues and comments exactly as briefed, and reply with only the issue key.
- **Ask instead of guessing** when a brief is ambiguous: reply `QUESTION: <one line>`.
- **Images:** a new chat per image. Never name or upload the work of the art inspiration (see Art).

## The game

A cross-platform momentum-action precision platformer. Three verbs only: **Move, Jump, Rope**.

- **Rope length rule:**
  - Connecting while airborne: the length locks at the player-to-impact distance on the connection tick.
  - Connecting on the ground: the rope pays out while running and locks on take-off.
- Run and jump momentum carries into the swing, and releasing keeps the swing's velocity.
- The rope is drawn as a dashed line.
- Death leads to an instant retry, with no delay or UI in between.
- v1.0 is Chapter 1: 3 sections × 3 levels + a finale boss level.

## Stack and commands

- TypeScript, Phaser 4 (a slim custom build in `vendor/`), Vite, Vitest, Playwright, and a custom kinematic physics adapter.
- Node 22.12 or newer.
- `npm run check` runs typecheck, level validation, lint and layer rules, format check, unit tests and the build.
- `npm run test:e2e` runs the Playwright tests. `npm run levels:solve` runs the route solver.

## Hard rules (from AGENTS.md)

**Layers** (enforced by `npm run lint:deps`):

- `src/core` imports nothing else in `src`. `src/physics` → core.
- `src/sim` → core and the physics interface, never `src/physics/backends`.
- `src/content` → core and sim types. `src/input` → core.
- `src/render` → core, sim types and content. `src/audio` and `src/telemetry` → core and sim types. `src/platform` → core.
- `src/tools` is dev-only and may import anything. `src/app/<target>` holds the composition roots.
- Phaser is imported only in render, tools and app. "Sim types" means `import type` only.

**Determinism:**

- Fixed 60 Hz step (`SIM_DT`), units in meters.
- No `Math.random`, `Date` or `performance.now` in `src/sim`, `src/core` or `src/physics`. No trig functions there either: use the core helpers.
- Stable iteration order. One persistent physics world per scene.

**Stop and ask before:**

- adding a verb or button
- changing the rope-length rule or removing release momentum
- a different simulation for mobile, or auto-targeting as the default mode
- copying reference art or commercial level layouts
- any delay or UI between death and retry
- contradicting the canon docs

**Testing:**

- New sim logic needs unit tests, and new state must show in the debug overlay.
- Levels must stay solvable by the route solver; the solutions in `content/solutions/` are CI gates.
- Changes to replay hashes need the device-lab goldens updated (`src/tools/device-lab/golden.ts`).

## Repo map

| Path                      | What                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sim/`                | Simulation: `Simulation.ts` (player, rope, deaths, checkpoints, exits, enemies), `targeting.ts`, `exits.ts`, `enemies.ts`, `hash.ts`                                                  |
| `src/physics/`            | `adapter.ts` (PhysicsAdapter interface), `backends/kinematic/` (shipping), `backends/planck/` (reference)                                                                             |
| `src/render/`             | `scenes/GameScene.ts`, `hero/drawHero.ts`, `feedback/` (failure feedback), notebook page rendering, debug overlay                                                                     |
| `src/app/web/`            | `main.ts` composition root, `ui/` (title, level select, pause, results)                                                                                                               |
| `src/content/`            | level parsing and validation, runtime tuning                                                                                                                                          |
| `src/platform/`           | platform services, save system (`save/`)                                                                                                                                              |
| `src/tools/`              | route solver, device lab, art preview (dev only)                                                                                                                                      |
| `content/levels/*.json`   | level data (v2 schema `content/level.schema.json`); `content/solutions/` solver fixtures; `content/chapters/chapter-1.json`; `content/tuning/runtime.json`; `content/strings/en.json` |
| `docs/`                   | design and system docs; `docs/levels/` per-level design docs; `docs/agents/` this workflow                                                                                            |
| `tests/unit`, `tests/e2e` | Vitest and Playwright                                                                                                                                                                 |
| `assets/`                 | art and `assets/provenance.csv` (every asset needs a row)                                                                                                                             |

## Art

- **Base look (owner, 2026-10-09):** concepts 0014/0015. Layered black pen sketch on mostly empty college-ruled paper:
  - a doubled contour plus a hatch skirt on the shaded side
  - thin lines
  - red only for danger
- **Per-level variation:** themes may vary terrain, background and shading. Background can range from empty paper (0015) to faint ballpoint scenery (0014).
- **Not this:**
  - no real desk or stationery objects (rejected 0010)
  - not goth-core
  - not generic cute (rejected 0012)
- **Kit and inspiration:**
  - The level art kit is `assets/sheets/0016-level-kit-thin.png`, rendered by GMR-107.
  - Next inspirations: Jump King and Celeste (Linear doc 07B).
- **Hero:** approved sheet 0007 (no scarf), and the heads from 0008 are approved for use.
- **References:** the owner-curated reference chat in BrowserGPT ("Apply StickGame Art Style") may be used for art generation. Never name the artist, never add references, and keep the originality rules in 07A Part 2B.

## Current state

- **Built:** levels 1-1, 1-2 and 1-3 (Section 1), all solver-verified.
- **Systems:**
  - racing timing with PB ghost and Backspace respawn
  - death bodies with B/C controls and an eraser sweep
  - kit-based pen-sketch renderer
- **Exits:** no speed limit (owner).
- **Live plan:** `docs/agents/HANDOFF.md`.
