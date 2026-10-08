# Brief templates

Copy, fill in the `<…>` fields, and send. Opus writes the content; these templates only fix the format, so the receiving tool needs no extra context and the result comes back in a form that's cheap to read. Workflow: [workflow.md](workflow.md).

## 1. Issue brief (Opus → BrowserGPT, which files it in Linear)

```
File this as a Linear issue in team GameDev, project "Precision Tether Platformer". Use the text exactly; don't add scope.

Title: <imperative title>
Why: <one or two sentences>
Locked constraints: <AGENTS.md / canon rules that apply>
Do: <exact changes, file by file where known>
Don't: <out of scope; stop-and-ask items it must not touch>
Acceptance:
- <testable criterion>
Evidence: <tests to add, numbers, screenshots, solver output>
Route: <muse | inbox | codex | subagent>
Reply with only the issue key.
```

## 2. Code task for BrowserGPT → patch inbox

```
Repo kaus-h/stickgame, branch main (read it with the GitHub connector). Follow AGENTS.md.
Task: <GMR-123> as described in that Linear issue.
Files to change: <paths>. Don't change any other files.
Output: ONE downloadable file named <GMR-123-short-name>.bundle.txt containing the complete new
content of every changed file in this format:
===== FILE: <path> =====
<complete file>
===== END FILE =====
(Use ===== DELETE: <path> ===== to delete.) For files over 400 lines, give a unified diff
against main instead, in <GMR-123-short-name>.patch.
Include the unit tests that prove the acceptance criteria. No explanation needed in chat.
```

**Fix round:** `Fix <GMR-123>: the inbox's failure log is on PR #<N> (or: <pasted RESULT.md error>). Send a new <GMR-123-short-name>.bundle.txt with the corrected complete files.`

## 3. Small exact task for Muse → PR

Muse has write access but isn't frontier-level, so spell out everything.

```
Repo kaus-h/stickgame. Create branch muse/<gmr-123-short-name> from main.
Make exactly these changes and nothing else:
1. In <path>, <exact edit: replace X with Y / add this function: …>.
2. <…>
Don't reformat, rename, or touch any other line or file.
Commit message: "<GMR-123>: <title>"
Open a PR to main titled "<GMR-123>: <title>" whose body says: "Muse task from Opus brief. Changes: <list>."
Reply with only the PR URL.
```

Good Muse tasks: a constant or tuning value, strings, a JSON content edit, one small test, docs, a provenance row. Not for Muse: anything in `src/sim`, `src/physics`, determinism, rope rules, or multi-file refactors.

## 4. PR review (Opus → BrowserGPT)

```
Review PR #<N> in kaus-h/stickgame against AGENTS.md, the Linear issue <GMR-123>, and the
canon docs it cites. Check: acceptance met, layer rules, determinism rules, stop-and-ask list,
missing tests, anything outside scope. Read the CI summary comment too.
Reply in at most 8 lines, the last line exactly one of:
VERDICT: MERGE | VERDICT: FIX <one-line reason> | VERDICT: OPUS <why Opus must look>
```

## 5. Local task (Opus → ChatGPT desktop / Codex)

```
Take <GMR-123> per its Linear issue. Branch from main using Linear's branch name. Use your
Luna subagents for mechanical parts. npm run check must pass. Open a PR to main and post the
evidence in the Linear issue. Don't merge.
```
