# Agent workflow: who does what, and how work moves

The rule behind this doc (revised by the 2026-10-12 speed audit): **Opus builds what decides quality, and delegates only work that runs in parallel and costs less to hand off than to do.**

## Roles

| Resource                                                          | Role                                     | Can                                                                                                                                                                                 | Cannot                                                                | Cost                                       |
| ----------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| **Opus 5.5 (Claude Code), high/xhigh effort**                     | Head of design and lead builder          | Design and build visuals, feel, levels and UX; rule on canon; review; merge; report to the owner                                                                                    | Relay small work through browser agents (it costs more than doing it) | Metered: every call costs the full context |
| **BrowserGPT (GPT-6 High, in-app browser tab)**                   | Main code writer, reviewer, Linear clerk | Read the repo (read-only GitHub connector), **write Linear issues and comments**, write code as patch/bundle files for the inbox, review PRs, research, images (new chat each time) | Push to GitHub, run the game or tests                                 | Unlimited                                  |
| **Meta Muse (in-app browser tab)**                                | Junior coder for small, exact tasks; art | **Open branches and PRs directly** (GitHub MCP, write access to code, issues, PRs), images                                                                                          | Frontier-level judgment: give it exact, small, fully specified tasks  | Unlimited                                  |
| **ChatGPT desktop app (Codex, GPT-6.1 sol, with Luna subagents)** | Local senior engineer                    | Multi-file work, debugging that needs runs, inbox tasks that failed twice, local playtest checks                                                                                    | –                                                                     | Metered (Codex quota)                      |
| **Claude subagents (Sonnet 5.5; Opus only for design)**           | Local executors for tool loops           | Level build → solve → screenshot loops, mechanical edits                                                                                                                            | –                                                                     | Metered (Claude quota)                     |
| **GitHub Actions**                                                | Build and test farm                      | `npm run check`, e2e on 3 browsers, route-solver verify, PR summary comment, previews                                                                                               | –                                                                     | CI minutes only                            |
| **Patch inbox (`npm run inbox`)**                                 | Code landing machine (no model)          | Apply a chat model's patch/bundle to a fresh branch from main, run `npm run check`, push, open or update the PR                                                                     | Judge anything                                                        | Free (local compute)                       |

## Routing (speed audit, 2026-10-12)

Every Opus tool call is billed at the full current context. The audit measured where two long sessions went: about two thirds of Opus's tokens went to relaying work through other agents (ChatGPT/Muse tabs, Linear, gh/CI/merge, the Codex app), and about 5% to looking at the game. So:

1. **Opus builds by default.** Visual, feel, level, UX and gameplay code, and any change it can finish in a few calls, Opus writes, checks in the running build and iterates. No Linear brief is needed for that work. A one-line Linear comment when it merges is enough.
2. **Delegate only big, isolated, spec-exact modules that run in parallel** (about 300 lines or more, no taste calls, nothing Opus will touch while it's in flight): BrowserGPT → patch inbox, or Codex when it needs local runs. Muse handles batched tiny chores only.
3. **Loops go to subagents:** level build/solve/screenshot loops and bulk mechanical edits. Use an Opus subagent for visual judgment and Sonnet for the mechanical ones. Their output stays out of the main context.
4. **Review:** CI plus Opus's own read for Opus's code. BrowserGPT reviews delegated code only.
5. **Context:** hand off at 400k (see Milestones). A user-level hook injects a `CONTEXT WATCHDOG` reminder at 300k and 400k.
6. **Images:** screenshots at scale 0.5 or less, contact sheets instead of many single shots, and no full-resolution PNG `Read`s in the main thread.

## Patch inbox

The inbox folder is `D:\tmp\inbox` (override with `--inbox` or `STICKGAME_INBOX`). Run it once with `npm run inbox`, or keep it running with `npm run inbox -- --watch` (a background process; no model involved).

**Task** = a file or folder named after the issue: `GMR-123-short-name`. It can hold:

- `*.bundle.txt` / `*.bundle.md`: whole files, the best format for chat models:
  ```
  ===== FILE: src/path/file.ts =====
  …complete file content…
  ===== END FILE =====
  ===== DELETE: src/path/old.ts =====
  ```
  Text outside blocks is ignored, and a code fence around a file's content is removed.
- `*.patch` / `*.diff`: unified diffs against current main, applied with `git apply --3way`. Use these for large files.
- `files/…`: a tree copied over the repo.
- `task.json` (optional): `{ "issue", "title", "summary", "author", "branch", "base", "check" }`.
- `.zip` of any of the above.

**What the script does:**

1. Creates a fresh worktree on `inbox/<task-slug>` from `origin/main`, or from the existing branch if this is a fix round.
2. Applies the task, installs worktree dependencies, regenerates `src/content/level-validator.generated.js` with `npm run levels:compile-schema` if the level schema was touched, then formats existing touched and generated files with the local Prettier through Node. Schema or formatting failures stop the task before check/commit and include the diagnostic in `RESULT.md`.
3. Runs `npm run check`.
4. Commits, pushes, and opens a PR. The PR is a draft if the check failed, and its comment carries the error excerpt. A fix round instead adds a comment to the existing PR and toggles draft or ready.
5. Moves the task to `done/` or `failed/`, writes a `RESULT.md` next to it, and appends one line to `log.jsonl`.

Git commands pin the requested checkout and discard inherited repository/index selectors and injected Git configuration. Before apply, commit, and push, the inbox verifies the exact linked worktree, branch, and repository ownership. It stages only validated task and generated paths and refuses an unexpected staged path; the owner checkout and `.claude/` files are never committed. Error excerpts fall back to the last 30 log lines when no error pattern matches.

**Refused:**

- paths outside the repo
- `.git/`, `node_modules/`, `.claude/`, `.env*`
- symlinks and junctions in task input trees or destination path components

**Flagged for Opus:**

- `.github/`, `package*.json`, `AGENTS.md`, `scripts/agents/`
- device-lab goldens, lint and layer configs

**Branch naming:** branch names contain the issue key, so Linear's GitHub integration links the PR and closes the issue on merge.

**Fix loop:**

1. Opus types one line into BrowserGPT: "Fix GMR-123; the failure is on PR #N."
2. BrowserGPT reads the PR comment through its connector and downloads a new bundle with the same task name.
3. The inbox applies it as a fix round.
4. After **two** failed rounds, the task goes to Codex.

**Getting downloads into the inbox:** nothing to set up. The Claude desktop in-app browser saves downloads to the root of `D:\` as GUID-named `.tmp` files and loses the filename. Every sweep therefore checks `D:\` and `~/Downloads` (override with `--downloads "<dir>;<dir>"` or `STICKGAME_DOWNLOADS`, disable with `--no-downloads`) for files from the last 48 h that start with a TASK line:

- `===== TASK: GMR-123-short-name =====` for bundles
- `TASK: GMR-123-short-name` for patches

Matching files are moved into the inbox under that name. Other files are never touched, and only their first 4 KB is read. Files saved straight into the inbox work too. Partial downloads (`.crdownload`, `.part`) are skipped until they finish.

## Talking to each tool cheaply

- **BrowserGPT and Muse:** type the prompt with `form_input`/`type` and send. Don't screenshot or read the whole reply. Wait for the download (BrowserGPT) or the PR (Muse), then read only that. If a reply has to be read, use `get_page_text` with a small `max_chars`.
- **ChatGPT desktop (Codex):** one line through computer use, for example "Take GMR-123 per its Linear issue; branch from main; open a PR; post the evidence in Linear." No progress screenshots. Watch the PR with `gh`.
- **GitHub:** use `gh … --json … --jq …` one-liners, and `gh pr checks --watch` in the background.
- **Linear (Opus):** request only the `fields` needed. BrowserGPT writes issues and comments; Linear's GitHub integration moves statuses.

## Browser agent context

Browser agents start from [`CONTEXT.md`](CONTEXT.md), the context pack. It lives in the BrowserGPT project "StickGame" (instructions field plus an uploaded file), and in Muse the same way if Muse supports projects. Otherwise it is pasted as the first message of each chat. Never prompt a bare chat for project work. Regenerate the pack at each milestone and re-upload it when its date line changes. The reusable version of this whole setup for other projects is [orchestrator-system-prompt.md](orchestrator-system-prompt.md).

## Creative work (owner, 2026-10-12)

Beauty and game feel come first, and optimization (load budgets, code-splitting, GMR-36) is deferred. Opus builds visual, feel and level work hands-on and iterates visually: screenshot, judge, change, repeat. Other agents get the mechanical work. Review round-trips must not throttle creative iteration.

## Milestones and fresh sessions

Long sessions get compacted, which is expensive. At the end of each milestone, **or when the context window reaches about 400k of 1M tokens** (owner, 2026-10-12), whichever comes first, Opus:

1. Updates [`HANDOFF.md`](HANDOFF.md) (state, open PRs, next issues, decisions) and regenerates [`CONTEXT.md`](CONTEXT.md).
2. Records durable rules in memory and canon decisions in the canon docs.
3. Starts a fresh session with a one-time scheduled task (`create_scheduled_task`, run now) whose prompt is: "Read AGENTS.md, docs/agents/workflow.md and docs/agents/HANDOFF.md; continue the roadmap as head of design and orchestration (Opus 5.5)."
4. Ends the current session.

## Safety

- Main only changes through PRs that are green on CI and reviewed. Opus merges, using merge commits.
- Muse and inbox PRs are never merged on their own CI result. Opus reads the summary and BrowserGPT's verdict first.
- The AGENTS.md stop-and-ask list applies to every tool. A brief that would hit it goes back to Opus, then to the owner.
