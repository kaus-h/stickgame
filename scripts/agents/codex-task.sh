#!/usr/bin/env bash
# Run one GPT-6.1 sol task headless through the Codex CLI, in its own worktree,
# then run the local check, push, and open a PR (draft if the check fails).
#
#   scripts/agents/codex-task.sh <branch> <brief.md> [effort]
#
# <branch> holds the Linear key (e.g. codex/gmr-115-film) so Linear links the PR.
# <brief.md> is Opus's spec. Effort defaults to high. An existing branch is a fix round.
# Env: CODEX_BIN (default ~/.npm-global/codex), CODEX_SANDBOX (workspace-write | bypass),
#      CODEX_WT_ROOT (default D:/tmp/codex). Run it in the background; read only the result file.
set -euo pipefail

branch="$1"; brief="$2"; effort="${3:-high}"
codex="${CODEX_BIN:-$HOME/.npm-global/codex}"
root="$(git rev-parse --show-toplevel)"
slug="${branch//\//-}"
wt="${CODEX_WT_ROOT:-/d/tmp/codex}/$slug"
out="${CODEX_WT_ROOT:-/d/tmp/codex}/$slug.result.md"
log="${CODEX_WT_ROOT:-/d/tmp/codex}/$slug.check.log"
mkdir -p "$(dirname "$wt")"

git -C "$root" fetch -q origin
if [ ! -d "$wt" ]; then
  if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git -C "$root" worktree add -q "$wt" -B "$branch" "origin/$branch"
  else
    git -C "$root" worktree add -q -b "$branch" "$wt" origin/main
  fi
fi
cd "$wt"
npm ci --no-audit --no-fund --prefer-offline >/dev/null

prompt="You are GPT-6.1 sol working in a git worktree of StickGame (a TypeScript/Phaser precision platformer).
Read AGENTS.md first and follow it: layer rules, determinism rules, stop-and-ask list.
Implement the brief below completely. Touch only what it needs. Add unit tests for new logic.
Run \`npm run check\` and fix failures until it passes. Do not commit, push, or open PRs; leave changes in the working tree.
If the brief would hit an AGENTS.md stop-and-ask item, stop and explain instead.
Finish with a short summary: what changed (files), what you verified (commands and results), what you did not verify.

=== BRIEF ===
$(cat "$brief")"

if [ "${CODEX_SANDBOX:-workspace-write}" = bypass ]; then
  sandbox=(--dangerously-bypass-approvals-and-sandbox)
else
  sandbox=(-s workspace-write)
fi
"$codex" exec -C "$wt" "${sandbox[@]}" -c model_reasoning_effort="\"$effort\"" -o "$out" "$prompt" >/dev/null 2>&1 || true

if npm run check >"$log" 2>&1; then status=passed; else status=failed; fi
git add -A -- . ':!.claude'
if git diff --cached --quiet; then
  echo "NO CHANGES ($status). Result: $out"; exit 1
fi
git -c user.name=kaus-h -c user.email=kaustav.kalra123@gmail.com commit -q -m "$(head -1 "$brief" | sed 's/^# *//') (GPT-6.1 sol)

Written by GPT-6.1 sol via scripts/agents/codex-task.sh; local check $status."
git push -q -u origin "$branch"

body="**Author:** GPT-6.1 sol (Codex CLI, headless). **Local \`npm run check\`:** $status.

$(cat "$out" 2>/dev/null || echo '(no summary)')

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
if gh pr view "$branch" --json number >/dev/null 2>&1; then
  gh pr comment "$branch" --body "Fix round. $body" >/dev/null
  url="$(gh pr view "$branch" --json url --jq .url)"
else
  draft=(); [ "$status" = failed ] && draft=(--draft)
  url="$(gh pr create --base main --head "$branch" "${draft[@]}" --title "$(head -1 "$brief" | sed 's/^# *//')" --body "$body")"
fi
echo "PR $url  check=$status  result=$out"
