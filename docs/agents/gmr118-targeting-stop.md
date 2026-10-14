# GMR-118 targeting: stopped on the taught-route guard

Date: 2026-10-14. Baseline: cb0dfc6859990509b4f813f6b874cec08dd2f11d.

The brief requires stopping when centre attachment makes a taught route die or a mistake survive. That guard fired before the remaining targeting changes were implemented. All partial implementation and temporary probe tests were restored; level geometry and committed solution fixtures were never edited.

## Constraints and acceptance

The authorized change is one shared simulation with centre attachment, the existing airborne connection / grounded take-off length lock and unchanged release momentum. Input mappers import core only; selection and hysteresis belong in sim. No new verbs, release cues, geometry, art, living renderer or audio changes are allowed. Both touch modes are playtest choices; their comparative quality remains open. The brief fixes mouse, stick and neutral selection rules and the 12-degree / 0.5-metre stickiness margins.

Acceptance requires targeting, replay compatibility, determinism and run-tag unit tests; camera fairness; a passing npm run check; and regenerated solver fixtures with old/new tightest windows. Those feature criteria remain pending because the explicit route guard takes precedence.

## Reproduction and results

The only production change in the probe was in src/sim/targeting.ts:

```diff
-  const offset = vec2(dx * k, dy * k);
+  const offset = vec2(0, 0);
```

The existing impact calculation then resolves to the current anchor centre; selection, assist radii and all length-lock logic remain unchanged. Three temporary tests checked the centre impact, zero offset and centre distance for standard, wide-select and snap: all three failed before the probe and passed with it.

Command: node node_modules/vitest/vitest.mjs run tests/unit/level11.test.ts tests/unit/level13.test.ts src/sim/targeting-v2.test.ts

Result with the centre probe: 7 passed, 3 failed.

- tests/unit/level11.test.ts:102: C5 taught route, "jumping early locks a long rope that carries to the far ledge in one swing", dies for release tick 606. Expected died=false; received true. This is a survival assertion, not a shifted numeric length threshold. No test timing or meaning was changed.
- tests/unit/level13.test.ts:71 and :146: the default and mastery route proofs reach only C1-C3 instead of C1-C7. These old fixture inputs were tested through centre behavior during the probe; this does not establish that 1-3 is unsolvable after re-solving.
- docs/levels/1-2-release.md separately documents C5 as a near-rim lesson. No solve was run, so 1-2 unsolvability is not claimed.

After restoring the probe and removing its temporary test:

Command: node node_modules/vitest/vitest.mjs run tests/unit/level11.test.ts tests/unit/level13.test.ts tests/unit/camera-fairness.test.ts

Result: 15 tests passed in 3 files. The taught and mistake routes, both 1-3 route proofs and camera fairness pass with original targeting.

## Baseline tightest windows

These are read from the existing fixtures. New values were not measured because the taught-route STOP condition fired before levels:solve. "No timed inputs" means no tightest-window value in the fixture; it is not an infinite measured window.

| Level          | Old               | New                 |
| -------------- | ----------------- | ------------------- |
| 1-1            | 5 ticks           | Not measured (STOP) |
| 1-2            | 3 ticks           | Not measured (STOP) |
| 1-3            | 4 ticks           | Not measured (STOP) |
| 2-1            | 5 ticks           | Not measured (STOP) |
| lab-01         | 1 tick            | Not measured (STOP) |
| lab-anchors    | 7 ticks           | Not measured (STOP) |
| lab-authoring  | 29 ticks          | Not measured (STOP) |
| lab-collision  | Recorded unsolved | Not measured (STOP) |
| lab-exit-miss  | 1 tick            | Not measured (STOP) |
| lab-exit-shaft | No timed inputs   | Not measured (STOP) |
| lab-exit-slot  | No timed inputs   | Not measured (STOP) |
| lab-exit-wide  | No timed inputs   | Not measured (STOP) |
| lab-moving     | 2 ticks           | Not measured (STOP) |

## Full check attempt

The shell exec tool failed before process creation. The Node runtime fallback invoked npm run check on the restored tree and reached npm run typecheck (tsc --noEmit), but repeated runtime timeouts prevented a completion status. A direct typecheck attempt also timed out. Therefore neither npm run check nor standalone typecheck is claimed to pass. The 15-test route/camera result above was completed and observed.

## Pending owner decision

Resolve how the existing taught routes should be reconciled with centre attachment before resuming implementation. No geometry change or weakened survival assertion is authorized by this brief. Hardware playtests, new replay compatibility, complete targeting acceptance and regenerated fixtures are unverified. No commit, push or PR was made.
