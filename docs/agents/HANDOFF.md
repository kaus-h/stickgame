# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before starting a fresh session ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-12, at the 400k-context handoff. **The owner's direction: beauty first, optimization deferred. Opus builds visual, feel and level work hands-on.**_

## State

- **Main (9f884d6):** Section 1 plus 2-1. The game is named **StickSwing** (#74).
- **Merged today:**
  - **#61:** terrain kit 0017.
  - **#70 and #72, GMR-50 done:**
    - key remapping;
    - high contrast and a larger reticle;
    - `docs/accessibility.md`.
  - **#71:** budgets re-based to 300 / 1220 KB.
  - **#73, goons:** a 60° stomp rule, so corner landings are safe; a hatched ink critter with slit eyes; red thorns on the flanks only. The owner liked it ("feels way better").
  - **#75, exits:** a reached exit always accepts. There are no speed, angle or alignment rejects in any chapter level, guarded by a test (owner ruling).
- **Owner playtests** at `localhost:5173` from `D:\StickGame`. Keep it on main. The dev server was restarted through the preview tool (`launch.json` "dev"); the inbox watcher may need restarting.

## Open PRs (both need CI green, a BrowserGPT MERGE verdict and `safe-merge.sh`)

- **#76 (docs):** the Living Notebook plan, the 400k handoff rule and this HANDOFF.
- **#77 (Living Notebook, branch `living-notebook`), five commits:**
  - **Line boil:** a world-locked Displacement filter at 8 fps.
  - **Camera stack, front to back:** paper (never boils), then crisp (the hero and spikes, which never boil, per the owner), then the boiling world, then the UI. A camera after a filtered camera drops its composite in Phaser 4, so the crisp camera sits _below_ the world camera.
  - **Drawn red ink pools:** a live ripple and bubbles.
  - **Ink juice:** dust, take-off kicks, the rope bite blot, the release flick, speed hatching and the rope draw-on.
  - **Level draw-in:** a 0.6 s pen reveal.
  - **Page vignette.**
  - **Title page doodle:** the hero swings under "StickSwing".
  - **Pencil drop-shadows.**
  - **Expect e2e failures:** the pool pixel tests in `kit-0017.spec.ts` and `level-kit.spec.ts` assume the old pool slices. Update them, keeping the "red mass, no pale band" intent.

## Next

1. **Land #77,** then show the owner (they asked for gorgeous; check they like the boil amplitude, 1.6 px, `?boil=N`).
2. **Continue the Living Notebook** (`docs/art/living-notebook.md`):
   - margin doodles that react;
   - an exit page-turn;
   - floating terrain pieces that make visual sense (the owner relaxed "nothing floats"; see GMR-111);
   - a richer page composition.
3. **Section 2 levels:** 2-2 needs GMR-60 phase 2, GMR-61 crushers and the GMR-63 ceiling pocket.
4. **GMR-113, platform reach** (owner, LOCKED in doc 14 §5):
   - web, iOS/Android, web portals and full **controller support** (brief it after the visual pass);
   - console later;
   - Roblox would be a separate rebuild.
5. **Deferred:** GMR-36 load and code-split, GMR-51 trademark and domain (owner).

## Workflow notes from this session

- The slowest parts of the loop:
  - BrowserGPT review round-trips through Chrome (each Chrome call returns about 1.5k tokens of tab list);
  - three-browser e2e on every push, about 15 min with cancellations.
- Proposed to the owner and awaiting an answer:
  - Opus-authored render PRs get CI plus an Opus self-review, without BrowserGPT;
  - e2e runs Chromium on every push, with Firefox and WebKit on main.
- `kit17-assets.test.ts` times out under full-suite load locally (it passes alone). A fix task chip was offered.
- Playwright browsers aren't installed locally. Rely on CI for e2e.

## Watch out

- **Slim Phaser:** filters exist on cameras, but helpers like `Color.IntegerToColor` don't. The Vignette filter crashes, so use canvas overlays.
- **Slim guard test:** don't write `Phaser.Textures.*` in `src`; use structural types.
- **Muse is at muse.ai.** Inbox PRs are drafts (`gh pr ready`). Never put issue keys in PR titles.
