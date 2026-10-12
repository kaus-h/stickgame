# Patroller goon (GMR-45)

## Constraints and acceptance

Canon: doc 05 and doc 09 G1–G4. Combat uses Move, Jump and Rope; no attack button.
The fixed 60 Hz deterministic simulation and rope-length/release rules stay unchanged.
Unsafe contact kills instantly in the existing world with a machine-readable enemy cause;
feedback never interrupts retry. Enemies are v2 authored collision entities. Simple goons
take one clean stomp; they are not tetherable. This does not settle advanced enemy taxonomy.

Acceptance: predictable patrol, trajectory-based top vulnerability, no false/missed stomps
in stress coverage, rebound usable to reach a next anchor, cleanup on death/restart/reload,
readable black-ink creature with red ballpoint only on dangerous parts, stomp audio, debug
state and location telemetry. G1/G3 receive evidence-based defaults without locking future
health systems or rebound tuning.

## Design and implementation plan

1. Author `enemies` in v2: stable `id`, `kind: patroller`, center `position`, full `size`,
   optional horizontal smooth ping-pong `path` (`to`, `period`, `phase`), and `stomp`
   (`minDownSpeed`, `reboundSpeed`, `topInset`). Reuse deterministic path math; validate
   bounds, safe floor support along the path, speed limits and viable top geometry.
2. Sweep the player circle against the moving enemy rectangle using physical motion and
   relative trajectory. First contact decides: descending through the inset top is a stomp;
   side/underside, upward or insufficient downward speed is unsafe. Resolve chronological
   contacts, including high-speed crossings and moving targets; no endpoint-overlap stomp.
3. A stomp defeats that enemy for the attempt, places the player at contact through the
   PhysicsAdapter, preserves the incoming horizontal velocity and applies authored upward
   speed. Keep rope ownership unchanged; no implicit detach or momentum cap. Reset restores
   every enemy deterministically in the same world. Empty enemy levels preserve old hashes.
4. Expose alive/patrol/stomp state, event location and enemy death identity in snapshots,
   hashes, telemetry and debug output. Draw matching ink geometry and an unambiguous safe
   top/dangerous perimeter. Add procedural stomp SFX through the existing audio pipeline.
5. GMR-43 lives on the owner's diverged stack. Inspect its cause-text contract read-only and
   provide an enemy-contact cause formatter/hook here; document reconciliation without
   merging PRs #22/#23/#25/#26. Use existing Graphics; do not add Phaser systems or raise budgets.
6. Evidence: pure swept geometry/stress tests, integrated rebound/rope/death/reset tests,
   schema invalid-input tests, fixed-rate replay repeatability, a playable stomp-to-anchor
   lab, browser screenshots/audio/result checks, full `npm run check`, bundle budget and CI.
   Compare rebound candidates at 12.5, 15 and 18 m/s with measurable continuation height.

Native-device feel, novice fairness and boss pacing remain unverified until human playtests.

## Measured defaults and practical limits

G1: unsafe basic-goon contact is one-hit death, as requested for this issue. The same-tick
death event retains enemy ID, contact position and incoming velocity before reset. It does not
settle boss health, armor or future damaging contacts. G2: one clean stomp defeats this patroller.
G3: the current lab default is 15 m/s upward rebound, preserving 100% of incoming horizontal
velocity. At gravity 30 m/s², the tested 12.5/15/18 candidates rise 2.578/3.719/5.363 m in
25/30/36 ticks after the stomp. The middle candidate adds 1.141 m above the normal-jump-speed
candidate without the highest launch. Human feel remains unverified. G4: this goon is not an
anchor; future tetherable enemies need a distinct visual rule.

The authored drop route, holding right from spawn, stomps at simulation tick 40 at
(6.662772, 6.65), arrives at (7.5, 16.925) m/s and rebounds at (7.5, -15) m/s. Aimed rope at
(11, 2) attaches at tick 58; release at tick 68 preserves motion, with zero deaths over 130 ticks.
Its replay hashes match 30/60/144 Hz presentation, jitter and encode/decode. Existing enemy-free
replay goldens remain unchanged; no golden was replaced.

Production contacts use timed kinematic sweep segments and point occupancy at correction
destinations; corrections cannot create offensive trajectories. Patrol endpoints follow the
deterministic path formula; within a fixed tick the target translates linearly between endpoints.
A stomp resolves at contact and starts its rebound on the next fixed tick. Candidate backends
without precise motion reporting use a tick chord and have not received equivalent feel validation.

This branch intentionally does not contain the owner's diverged Phaser slim build or full GMR-43
feedback system. The creature uses existing Graphics only. `render/feedback/causeText.ts` keeps
GMR-43's `(cause, solid)` formatter contract and adds `enemy-contact`; when reconciling stacks,
have `FailureFeedback.ts` import/re-export this formatter so repeat-death labels share it.
The spatial enemy label here appears during the already-active next attempt and cannot delay retry.
No bundle budget change or divergent-stack merge is included.

## Stomp rule and look v2 (2026-10-12, owner feedback)

- **Stomp:** a downward contact is a stomp when its contact normal is within 60° of straight up
  (`STOMP_MIN_UP = 0.5` in `src/sim/enemies.ts`). Landing on the top, including over its rounded
  corner, is safe. Side, underside and rising contacts still kill. The old `topInset` (a lethal
  band at each end of the top) is removed from the schema and levels.
- **Effect on 1-3:** the route's input windows widened from 7/4/6/66 ticks to 11/7/8/73 ticks
  (`tests/unit/level13.test.ts`).
- **Look:** a dark cross-hatched ink critter with a bristly contour, two narrow paper-slit eyes (no
  cartoon eyes or teeth), stepping legs and a clean flat back. Red ballpoint thorns appear only on
  the dangerous flanks, below the top band. Everything stays inside the collision box, and tests
  check this. Evidence: `docs/art/evidence/goon-v2/`.
