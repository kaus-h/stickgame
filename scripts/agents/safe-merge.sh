#!/usr/bin/env bash
# Merge a PR only when CI on its CURRENT head commit is complete and green.
#
#   scripts/agents/safe-merge.sh <pr-number>
#
# Waits for checks to register and finish, then requires at least one check and every
# conclusion SUCCESS, SKIPPED or NEUTRAL. An empty or pending check list never counts as
# green (2026-10-14: a gate that counted an empty rollup merged #99 before CI ran).
set -euo pipefail

pr="$1"
head="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"

for _ in $(seq 1 60); do
  total="$(gh pr view "$pr" --json statusCheckRollup --jq '.statusCheckRollup | length')"
  pending="$(gh pr view "$pr" --json statusCheckRollup --jq '[.statusCheckRollup[] | select((.status // "COMPLETED") != "COMPLETED" or ((.conclusion // .state // "") == "" ) or (.state == "PENDING"))] | length')"
  if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then break; fi
  sleep 20
done

bad="$(gh pr view "$pr" --json statusCheckRollup --jq '[.statusCheckRollup[] | (.conclusion // .state) | select(. != "SUCCESS" and . != "SKIPPED" and . != "NEUTRAL")] | length')"
total="$(gh pr view "$pr" --json statusCheckRollup --jq '.statusCheckRollup | length')"
now="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"

if [ "$total" -eq 0 ] || [ "$bad" -ne 0 ] || [ "$now" != "$head" ]; then
  echo "NOT MERGED: #$pr checks=$total not-green=$bad head-moved=$([ "$now" != "$head" ] && echo yes || echo no)"
  gh pr checks "$pr" || true
  exit 1
fi
gh pr merge "$pr" --merge --match-head-commit "$head"
echo "MERGED #$pr at $head"
