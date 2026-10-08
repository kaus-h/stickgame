# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-08, when the agent workflow was set up._

## State

- **Main:** all PRs through #35 are merged. That covers the prototype systems, game flow, saves, checkpoints, the route solver, patroller goons, and levels 1-1 and 1-2.
- **Chapter 1:** 1-1 and 1-2 are built and solver-verified. 1-3 (the goon level) is next.
- **Owner decisions:**
  - Hero 0007 is approved, and the 0008 heads are approved for use.
  - Device testing (GMR-33) is deferred until Chapter 1 is finished.
  - Agents may merge reviewed, green PRs.

## Open PRs

- (the orchestrator fills this in)

## Next

1. GMR-59, level 1-3 (goons): Opus designs the chambers, then the build/solve loop goes to an executor.
2. Exit speed bug: a plain run arrives at 7.501 m/s and fails a 7.5 cap. There's a task chip for it; 1-2's slot uses 8 m/s for now.
3. GMR-56 visual language, including the 0008 heads in the renderer. GMR-69 animation, GMR-42 music, GMR-30 close-out, GMR-31 gate.

## Watch out

- Tether e2e is flaky locally when the PC is busy. It's green in CI.
- Worktrees each need their own `npm ci` (`TEMP=D:\tmp`). Kill stray vite servers before running `npm ci` in `D:\StickGame`.
- The owner plays at `localhost:5173` from `D:\StickGame`. Keep that checkout on main.
