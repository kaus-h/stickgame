# AGENTS.md

Instructions for every coding agent on this repository (Codex reads this file natively; Claude Code reads it through `CLAUDE.md`). Humans should read it too.

## The game

Precision Tether Platformer (working repo name: StickGame) is a cross-platform momentum-action precision platformer. Three verbs only: **Move, Jump, Rope**. The rope length is the player-to-impact distance when it locks: on the connection tick if airborne, or on the take-off tick if it connected while grounded (it pays out while running). Run and jump momentum carries into the swing. The rope is drawn as a **dashed line**. Releasing keeps the swing's velocity. v1.0 is Chapter 1: 3 sections × 3 levels + a finale boss level (10 levels).

## Source of truth

The canon lives in the Linear project **Precision Tether Platformer** (team GameDev, key `GMR`). If code and canon disagree, canon wins; if canon looks wrong, raise it, don't silently change behavior.

1. 00 Game Canon, 01 Product Spec, 13 Build Definition, 14 v1.0 Scope
2. 02–08 design canon (07A for art), 10 Feature Catalog, 11 Terminology
3. 09 Open Questions (what is deliberately undecided), 12 Decision Register
4. ADR-001 (+ Amendment 1), 20–24 milestone plans, 30 Architecture, 31 Engineering Process, 32 Pipelines, 33 Ops

Never promote a `CURRENT DEFAULT` or `PROTOTYPE REQUIRED` item to locked without evidence and a canon update.

## Before you write code

For the Linear issue you're working on, write down:

1. the locked constraints that apply;
2. the open questions you're allowed to test (and the ones you're not);
3. the exact acceptance criteria;
4. the evidence you'll produce (numbers, screenshots, replay links).

**Stop and ask** instead of proceeding if the work would: add a gameplay verb or button; change the rope-length rule or remove release momentum; give mobile a different simulation; make auto-targeting the standard mode; copy reference art or commercial level layouts; add delay or UI between death and retry; or contradict a canon document.

## Architecture rules (doc 30, enforced by `npm run lint:deps`)

| Layer            | Folder                       | May import                                             |
| ---------------- | ---------------------------- | ------------------------------------------------------ |
| core             | `src/core`                   | nothing else in `src`                                  |
| physics          | `src/physics`                | core                                                   |
| sim              | `src/sim`                    | core, physics interface (never `src/physics/backends`) |
| content          | `src/content`                | core, sim types                                        |
| input            | `src/input`                  | core                                                   |
| render           | `src/render`                 | core, sim types, content                               |
| audio, telemetry | `src/audio`, `src/telemetry` | core, sim types                                        |
| platform         | `src/platform`               | core                                                   |
| tools            | `src/tools`                  | anything (dev-only; only `app` imports it)             |
| app              | `src/app/<target>`           | anything (composition roots)                           |

- Phaser is imported only in `render`, `tools` and `app`.
- "sim types" means `import type` only.
- Render objects are never authoritative state. Physics goes through the `PhysicsAdapter` only.

## Determinism rules (doc 30 §5, partly enforced by ESLint)

- Simulation runs on a fixed 60 Hz step (`SIM_DT`), in meters (`PIXELS_PER_METER` converts for rendering).
- No `Math.random`, `Date`, `Date.now` or `performance.now` in `src/sim`, `src/core` or `src/physics`. Use tick counts and the seeded RNG.
- Keep iteration order stable. One persistent physics world per scene; reset re-initializes bodies, it never recreates worlds.

## Commands

```bash
npm install          # Node >= 22.12
npm run dev          # Vite dev server on http://localhost:5173
npm run typecheck
npm run lint         # ESLint + layer rules
npm run test         # unit tests (Vitest)
npm run test:e2e     # Playwright smoke (run `npx playwright install` once)
npm run build
npm run check        # everything above except e2e
```

## Workflow (doc 31)

- One Linear issue = one branch (use Linear's branch name, e.g. `kaustavkalra123/gmr-38-...`) = one PR.
- PRs written by one agent are reviewed by the other agent before the owner merges.
- `npm run check` must pass. New sim logic needs unit tests; new state must be visible in the debug overlay.
- Update the Linear issue with evidence before moving it to Done. Record resolved decisions in the canon docs, not only in comments.
- Fill in the PR template checklist honestly; say what you didn't verify.

## Art and assets (docs 07, 07A, 32)

- deadanddetached is the main art inspiration. Follow the translation rules in 07A: use the qualities, never copy pieces or the artist's identity marks, never put the artist's name or images into an image generator.
- Every asset gets a row in `assets/provenance.csv` (source, prompt ID, human edits, date).
- Collision is authored in level data; art is aligned to it, never the reverse.
