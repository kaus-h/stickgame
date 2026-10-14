# Handoff

The orchestrator (Opus) rewrites this at the end of every milestone, or when the context window reaches about 400k tokens, before giving the owner a paste-ready prompt for a new chat ([workflow.md](workflow.md)). Keep it under about 60 lines. Durable rules belong in AGENTS.md, canon docs or memory, not here.

_Last updated: 2026-10-14, after the owner's third checkpoint (#94). **The vision is shifting: 1-1's look is NOT signed off, and the game becomes a journey through art-style worlds.**_

## State

- **Owner checkpoint 2026-10-14** (played main on the :5191 preview; memory `owner-answers-2026-10-14`):
  - The C4 and C5 lessons work.
  - The sting should be subtle → done in #94.
  - The lamp darkness is right, just less yellow → done in #94.
  - The whole music track should sound **"cleaner, more cyberpunk future creative whimsy"** → not started.
  - **1-1 look: "not at all" the aesthetic they want.** Everything bothers them: flat, beige, terrain reads as boxes, no wow moments.
- **New vision (memories `chapter-worlds-idea`, `ava-inspiration`):**
  - Each chapter is a distinct art-style world, with **sub-theme worlds** inside it. For example, Digital → home screen, software, file system, binary/code, internet, glitch.
  - The owner loves Alan Becker's "Animation vs. Animator": kinetic choreography, digital environments, fight/adventure energy. **Use its qualities only**, never its sequences, characters or premise (AGENTS.md stop-and-ask).
  - Fights: the default proposal is set pieces using Move/Jump/Rope. **A combat button would be a canon change, and the owner must decide.**
  - Proposed arc: pencil → cut paper → paint → neon → digital (the drawing is scanned in).
- **Concept frames:** round 1 (text-only, GPT-6 High) is in the StickGame ChatGPT project, as 4 chats (A notebook, B neon, C painterly, D cut-paper). Round 2, restyling our own frame `.claude/concept-refs/ref-0.png`, is **blocked until the owner says in chat "yes, upload the 1-1 screenshots to ChatGPT"**, or attaches the file themselves.
- **Deep Research (BrowserGPT, StickGame project), started 2026-10-14:**
  1. art-style worlds and sub-theme worlds for a three-verb rope platformer (precedents, a catalog, a 5-chapter map);
  2. an extremely deep analysis of Animation vs. Animator (qualities → original game design, a do-not-copy list, set-piece concepts).
     Read their final reports (with `get_page_text`, in a subagent) before designing.
- **Preview:** `preview-main` in `.claude/launch.json` serves a detached main worktree at `D:/tmp/wt/preview-main`, port 5191. Update it with `git -C D:/tmp/wt/preview-main checkout --detach origin/main` after a fetch.
- **Stash:** `stash@{0}` holds another session's dark-lamp WIP (PageLamp class missing). The owner's 2026-10-14 answer superseded it; drop it once the owner confirms.

## Next

1. **Owner decisions (batch them):**
   - approve the screenshot upload for concept round 2 (add a 5th, digital, frame);
   - choose fights as set pieces vs. a combat verb;
   - choose the order of the chapter worlds;
   - pick a concept direction for chapter 1.
2. Digest both Deep Research reports into a short **world bible draft** (`docs/art/worlds.md`): chapters → sub-themes → signature hazard, anchor twist, set piece, palette, music. Update 07A, doc 14 and the `world-look-decision` memory once the owner confirms.
3. **Music remix:** a cleaner synth palette and production, "cyberpunk future creative whimsy" (`src/audio/music/*`). It may become per-world banks.
4. **Level Factory:** GMR-116 (authoring format, with a per-chapter **world style** field: palette, terrain kit, background, music bank) and GMR-117 (mechanic catalog). Each chamber gets a taught route plus a pinned mistake (the `tests/unit/level11.test.ts` pattern).
5. Rebuild 1-1's look in the chosen chapter-1 style (terrain silhouettes, depth, wow moments).

## Workflow notes

- **Stills:** `npm run film:still -- <level> <tick[,tick…]> <out.png> [x,y,w,h] [WxH]`; tile them and read at ≤ 1500 px.
- **Hand routes:** the solver's `World` + `PlanSource` (`node_modules/.cache/route-solver/solver.mjs`). Fork from a committed replay state.
- **BrowserGPT work runs in a subagent** (it drives `mcp__Claude_Browser__*` tabs, one chat per task, inside the StickGame project, GPT-6 High). Uploading local files to ChatGPT needs the owner's explicit approval in chat.
- **Merging:** only when every rollup conclusion is SUCCESS, SKIPPED or NEUTRAL. CI "Check" includes the bundle budget (1203/1220 KB).

## Watch out

- **Slim Phaser:** use canvas overlays and string blend modes, not `Phaser.*` runtime constants.
- **`npm run check | grep … && git commit` masks failures.** Check the exit code.
- **No sun doodles.** Dashes belong to the rope alone. Red always means lethal.
- **Windows Python:** pass `newline=''`. Don't print non-ASCII to cp1252. A failed script piped into `gh pr edit --body-file` blanks the PR body.
