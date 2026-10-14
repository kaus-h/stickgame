# GMR-118 targeting v2 evidence

Date: 2026-10-14. Baseline: cb0dfc6859990509b4f813f6b874cec08dd2f11d.

## Locked constraints

Every platform uses the same simulation and attaches at the highlighted anchor's current centre. The existing airborne connection / grounded take-off length lock and release velocity remain unchanged. Selection and hysteresis live in sim, input mappers import core only, and replays preserve deterministic intent execution. No new gameplay verb, release cue, geometry, anchor position, art, living-renderer or audio change is authorized.

## Open questions and scope

Touch button and tap are comparative playtest modes; their subjective quality remains open. Input timings may be retimed to preserve taught-route survival and pinned-mistake death with the same lesson. The 2026-10-14 Opus amendment lifts the former route STOP; a lesson genuinely impossible to reproduce through inputs alone must be individually marked `it.fails` with the specified redesign comment. Level redesign and canon-default promotion remain outside this change.

## Acceptance and evidence

Acceptance requires centre attachment on every assist tier, mouse snap/miss, stick and neutral selection/hysteresis, both touch modes, replay compatibility, determinism, run tags, camera fairness, and a passing `npm run check`. Every level is re-solved without geometry changes; fixtures are replay-verified. The solver records neutral-default alternatives within the 0.5 m stickiness margin on committed rope presses. Route proofs preserve their lesson meaning. Hardware feel and first-clear timing require owner playtests.

## Route measurements

Old values below were read directly from baseline `content/solutions/*.json`, before regeneration. A tightest window measures a jump or rope input with other inputs fixed. "No timed inputs" denotes a null tightest window, not an infinite measured window.

| Level | Old tightest | New tightest | Old route | New route |
| --- | --- | --- | --- | --- |
| 1-1 | 5 ticks | Pending | 965 ticks | Pending |
| 1-2 | 3 ticks | Pending | 1294 ticks | Pending |
| 1-3 | 4 ticks | Pending | 1308 ticks | Pending |
| 2-1 | 5 ticks | Pending | 1184 ticks | Pending |
| lab-01 | 1 tick | Pending | 435 ticks | Pending |
| lab-anchors | 7 ticks | Pending | 449 ticks | Pending |
| lab-authoring | 29 ticks | Pending | 115 ticks | Pending |
| lab-collision | Recorded unsolved | Pending | None | Pending |
| lab-exit-miss | 1 tick | Pending | 101 ticks | Pending |
| lab-exit-shaft | No timed inputs | Pending | 59 ticks | Pending |
| lab-exit-slot | No timed inputs | Pending | 67 ticks | Pending |
| lab-exit-wide | No timed inputs | Pending | 67 ticks | Pending |
| lab-moving | 2 ticks | Pending | 755 ticks | Pending |

## Verification

Pending implementation and fresh commands. No commit, push or PR is made by the route task.
