# GMR-119: momentum impact lab

## Design note for the eventual PR

Combat uses the existing Move, Jump and Rope verbs. Each fixed tick checks hero-circle overlap
with live target circles. Damage requires the hero's velocity component toward the target to
meet its threshold, and the hero's full velocity direction to lie in the authored approach
window. A glancing high-speed touch can therefore be blocked. Each accepted impact removes
one hp; the final impact emits both `targetHit` and `targetBroken`.

`content/tuning/runtime.json` supplies `combat.minImpactSpeed = 9` m/s and
`combat.restitution = 0.5`. A target's `minSpeed` overrides the global threshold. Restitution
retains half the incoming normal speed in the reflected direction and preserves tangential
velocity. Separating contacts are pushed clear without reversing their outgoing velocity.
The rope remains attached. Targets are independent collision circles, never rope surfaces.

Boss weak points can build on authored hp, speed thresholds, approach windows and the same
ping-pong paths as moving anchors. No boss logic or extra input is introduced here. Wrapped
angle windows are clockwise in the y-down coordinate system: `350..10` straddles rightward,
`170..-170` straddles leftward, and a 360-degree span allows every direction.

A restart restores all targets. A checkpoint respawn preserves broken targets and refills
unbroken targets; paths return to their attempt-start phase. Target hp, position, radius,
threshold and last impact speed are visible in snapshots and included in state hashes.
Levels without targets keep their historical state hashes.

## Constraints and evidence

Locked: fixed 60 Hz simulation in metres; stable authored iteration; physics adapter mutations;
three verbs; existing rope length/release rules; unchanged input, targeting, living effects,
audio engine, existing levels and solutions. Placeholder art uses existing ink helpers and
existing sounds, with no new assets. Reduced motion suppresses hit shake and shatter motion.

Implementation choices tested here are overlap separation, signed/wrapped approach windows,
multi-hp contact accounting and a hand-played swing route. The unit suite uses `World` and
`PlanSource` with the real physics adapter; separate exact-contact fixtures exercise normal
versus tangential speed, restitution and reset semantics. Acceptance requires the unit tests,
schema compilation/validation, a non-crashing lab solver run and `npm run check`.

The solver proves a route to the exit, not destruction of a weak point. The pinned hand plan
in `tests/unit/impact-targets.test.ts` is the impact proof. Browser art approval, device playtests,
live audio listening, CI and release are separate verification steps.

## Measured impact

Move right at tick 0, jump at tick 5 (hold 20 ticks), and connect to `swing` at tick 15
(centre aim, keep attached). The impact lands at tick 51 with 12.388 m/s closing speed,
above the 9 m/s threshold. The target breaks and the rope remains attached. The reflected
hero velocity is approximately (-6.167, -3.411) m/s, above the safe floor.

Installed Chrome film captures at ticks 45, 51, 58 and 80 showed the intact bullseye,
crack, fragments and disappearance. Repeating with reduced motion showed no moving fragments.
Both captures produced no console/page errors, no deaths, and matching simulation hashes
at every captured tick. These captures use the pinned impact plan; they do not establish
production art approval or cross-browser/device behavior.

`npm run levels:solve -- lab-impact --budget 200000` solved the exit in 147 ticks,
with a 62-tick tightest window for `impact-lab` and no crash. The new lab solution is retained
because the repository requires a fixture for every level with an exit. No existing solution
fixture was changed.
