# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-12. Opus is now hands-on for design-heavy work (owner direction, 2026-10-11). Merged since the last handoff: visual language, level 2-1, hero animation, timed and one-use anchors, music, camera and telemetry._

## State

- **Main (bb7c6f7):** Section 1 (1-1, 1-2, 1-3) plus **level 2-1 "Moving Pivots"** (Section 2 has started), all solver-verified.
- **Merged on 2026-10-11/12:**
  - **GMR-56:** wordless visual language. Red = lethal only; highlighter = yours now; reach fade; exit gate, cone and streaks. H1, H3, H4 and H5 are owner-approved and LOCKED.
  - **GMR-69 phase 1:** drawn hero heads; squash, stretch and lean.
  - **GMR-60 phase 1:** timed and one-use anchors (`lab-anchors`).
  - **GMR-42 phase 2:** code-generated music on raw WebAudio (`docs/music.md`).
  - **GMR-44:** anchor-attention camera and a fairness proof.
  - **GMR-49 phase 1:** playtest telemetry (`?playtest=1`, Shift+E exports JSON).
  - **Tooling:** `npm run levels:plot` (level plus solver route as SVG).
- **Owner playtests** at `localhost:5173` from `D:\StickGame` (keep it on main; `npm run dev` and `npm run inbox -- --watch` run in terminal tabs).

## Open PRs

- **#61 GMR-112 terrain kit v2 (Codex):** fixes are in (e3d254b) and the art is Opus-approved. Waiting on BrowserGPT's code verdict, then `safe-merge.sh 61`.

## In flight

- **GMR-50 phase 1, keyboard remapping (BrowserGPT bundle).** When it lands, Opus wires `ControlsPanel` into `GameFlowUi` and `setBindings` into main.ts. Then phase 2 (Opus): high-contrast mode and a larger reticle. Flash reduction is already satisfied: there are no flashes in the game.
- **GMR-72 (2-1):** human playtest and the Section 2 art/audio pass are still open.

## Next (Production Vertical Slice gate, GMR-94)

1. Finish GMR-50; merge GMR-112. Then GMR-70 (Section 1 art production polish).
2. **GMR-35 share loop** and **GMR-36 web demo.** Both need the owner: hosting, a domain, and the game name (GMR-51 shortlist doc: Marginskip, Stitchflight, Ghost Radius).
3. **GMR-52 external playtests** with the playtest recorder.
4. **Section 2:** 2-2 needs moving-while-attached anchors (GMR-60 phase 2), crushers (GMR-61) and the ceiling-pocket exit (GMR-63) first.

## Decisions this milestone (all in canon or Linear)

- The visual language is locked (doc 09 H1/H3/H4/H5).
- Music: code-generated, raw WebAudio, "torn-page pulse" (09 I2, CURRENT DEFAULT until the owner listens).
- Timed anchors moved from 2-1 to 2-2 (doc 14).
- 2-1 deviations are justified in `docs/levels/2-1-moving-pivots.md`.
- The camera keeps the 7 m required-shot rule (09 E2); anchor attention is a safety net.

## Watch out

- **Muse is at https://muse.ai** (not meta.ai). In Chrome tabs: take a screenshot before clicking, use no newlines in prompts, never close tabs mid-batch, and avoid `find` (see memory).
- **Inbox PRs open as drafts:** run `gh pr ready <n>` before `safe-merge.sh`.
- **Linear auto-closes issues named in PR titles:** never put another issue's key in a PR title.
- **Background ChatGPT tabs can freeze** and lose replies on reload. Use a fresh tab per request.
- **Codex messages:** check that the message actually appears in the Codex thread. One silently went elsewhere.
