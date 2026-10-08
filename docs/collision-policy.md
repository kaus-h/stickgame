# Collision policy (GMR-24)

Measured with the Collision Stress Lab (`tests/stress/`) against the kinematic adapter
(`src/physics/backends/kinematic`) and through `Simulation`. Player is a circle, radius 0.35 m;
production runs 60 Hz with 4 physics substeps; gravity 30 m/s². Gameplay speeds are at most about
36 m/s (an 11 m rope swung from horizontal gives sqrt(2 g 2L) = 36 m/s; run 7.5, fall clamp 26).
The lab asserts a clean envelope up to 30 m/s and records 40, 50, 60 and 80 m/s. Run
`STRESS_REPORT=<file> npx vitest run tests/stress` to write the full table.

Level for hands-on checks: `content/levels/lab-collision.json`, opened with `?level=lab-collision`.

## 1. Failure envelope

Result per case across speeds 5, 10, 15, 20, 25, 30 | 40, 50, 60, 80 m/s. "clean" means no
tunneling, penetration at most the 1e-4 m solver skin (budget 2e-3 m), no NaN/Infinity, no snag, no
energy gain. All numbers are after the fixes in section 4.

| Case                                                             | 5-30 m/s  | 40-80 m/s | Notes                                                                                  |
| ---------------------------------------------------------------- | --------- | --------- | -------------------------------------------------------------------------------------- |
| Thin wall 0.02 / 0.05 / 0.2 m, angles 0-89 deg                   | clean     | clean     | continuous sweep: no tunneling by construction                                         |
| Thin floor 0.02 / 0.05 / 0.2 m, angles 0-89 deg                  | clean     | clean     | through Simulation the controller clamps fall speed to 26 m/s the tick after release   |
| Hazard strip 0.05 m, gap 0.5 .. 0 m, angles 0-60 deg             | clean     | clean     | a contact is always reported before the body can pass; no false contact at 2 mm gap    |
| Release of a swing next to a hazard strip                        | clean     | clean     | never crosses without a hazard contact                                                 |
| Sharp convex corner (vertex hit, offsets 0, 0.05, -0.2 m)        | clean     | clean     | speed never increases; slides off or stops, no penetration                             |
| Running off a platform edge                                      | clean     | clean     | 99.5% or more of horizontal speed kept                                                 |
| Seams: flush abutting tiles, 1 mm step, stacked wall tiles       | clean     | clean     | 99.9% (flush) / 90% (1 mm step) of speed kept, no ghost-collision snag                 |
| Concave floor+wall corner, 30 deg wedge crevice                  | clean     | clean     | body stays outside both faces (wedge was 0.056 m deep before the fix)                  |
| Narrow tunnel, gap 0.72 / 0.8 / 1.0 m                            | passes    | passes    | entered level at any speed                                                             |
| Narrow tunnel, gap 0.6 m (below 2r = 0.7)                        | blocked   | blocked   | penetration 0 (was up to 0.12 m before the fix)                                        |
| Narrow tunnel, gap exactly 0.7 m (2r)                            | coin toss | coin toss | within 1 mm of the diameter the skin decides; never author this                        |
| Low ceiling during a swing (L = 5 m, underside 2.5 m and 4 m)    | clean     | clean     | rope stretch 0.04 m and 0.105 m worst case, see section 3 (was 0.10 / 0.24)            |
| Rope pulling the body into a wall or floor (L 0.8-2 m)           | clean     | clean     | collision wins; stretch equals the geometric minimum (e.g. 0.85 m for L 0.8); no speed |
| Near-zero rope, L 0.8 m (the rule minimum)                       | clean     | clean     | energy conserved                                                                       |
| Near-zero rope, L below 0.8 m (adapter only; Simulation rejects) | finite    | finite    | L at or below about 0.01 m aliases the pendulum angle and can gain energy; no NaN      |
| Extreme rope, L = 11 / 25 / 60 / 120 / 500 m                     | clean     | clean     | no stretch, energy drift within tolerance                                              |
| Simulation swing at 0.8 / 5 / 11 m, with and without ceiling     | clean     | clean     | rope length rule rejects 0 to 0.79 m ("too-close") and above 11 m ("too-far")          |

Nothing tunneled and nothing went non-finite at any speed up to 80 m/s. Penetration is bounded by
the skin everywhere except the two configurations that cannot be satisfied (gap below the body
diameter, rope pulling into a solid), where it is also zero after the fixes.

## 2. Policy

**Speed cap.** No hard cap is needed for tunneling: bodies are swept continuously against segments
(circle versus faces and end caps), so any speed is safe against thin geometry. Keep the soft design
ceiling of 40 m/s for release speed (the physical maximum is 36 m/s at an 11 m rope) so the camera,
audio and hazard timing stay readable. Do not add a cap in the adapter; if one is wanted it belongs
in `Simulation` and needs a canon decision.

**Substeps.** Keep 4. Collision is swept so substeps do not buy tunneling safety. They matter for the
pendulum angle: the rotation per substep is |v| / (L * 240), at most 0.19 rad for 36 m/s on the
0.8 m minimum rope. Rope lengths below about 0.1 m at 30 m/s would alias, which is why the 0.8 m
minimum (doc 04) must stay in `Simulation` and is a hard rule, not tuning.

**Body shape.** Keep the circle. Reasons: (1) the rope pivot, swing radius and impact distance are
all measured from the body center, and a circle keeps that exact; (2) a circle slides over tile
seams, 1 mm steps and convex corners without the ghost-contact snags a flat-bottomed capsule shows
(measured: 99.9% of speed kept on seams); (3) the sweep stays a closed-form circle versus segment
test with deterministic arithmetic; (4) the 0.7 m diameter provides a consistent basis for the
0.8 m production tunnel-clearance rule below. A capsule would only be justified by a feel problem
(standing on one-pixel ledges), and that should be judged in the movement lab, not here. Art may
still draw a taller figure over the circle.

**Constraint versus solid priority: collision wins.** If the rope wants the body inside a solid, the
solid keeps the body out and the rope is left violated (stretched) for as long as the geometry
holds it. This is verified in `tests/stress/regressions.test.ts`. The adapter implements it as:

1. The pendulum step only runs while the body is on the circle (within 0.01 m). Beyond that, a solid
   is holding the body out, so the body flies freely and is pulled toward the circle by a
   collision-aware sweep, which slides it along the surface instead of through it.
2. When the pull is blocked, the body's velocity becomes the motion that actually happened. Without
   this, gravity piled up phantom speed on a body the rope held in place (22 m/s measured), which
   showed up as a launch on release.
3. When the body is already overlapping a face or an end cap and moving deeper, it is blocked at
   once, so a body squeezed between two surfaces never sinks in.

Resulting stretch is bounded by the geometry: the closest reachable distance minus L (0.85 m for the
worst lab case), and about 0.1 m (2% of L) when a ceiling clips a swing. No tether-break rule was
needed and none was added: the state is stable, finite and silent on release. If design wants
the rope to snap when it is held more than some stretch for some time, that is a `Simulation` rule
(it owns the rope), and it should be a canon decision. Do not hide it inside the adapter.

**Hazards.** Contacts are reported when they begin and only once while touching, from the same sweep
that blocks the body, so a hazard cannot be crossed without being reported.

## 3. Residual behavior worth knowing

- A swing that hits a ceiling slides along it until the rope pulls it back; worst measured stretch
  during that slide is 0.105 m on a 5 m rope (swept 5 to 80 m/s).
- Releasing from a stretched rope keeps the real motion, not a spring-loaded speed.
- Sim-level fall speed is clamped to `maxFallSpeed` (26 m/s) one tick after a swing release, while
  lateral speed is not. A 36 m/s diagonal release therefore loses vertical speed on the next tick.
  This is existing controller behavior, recorded, not changed.
- The adapter accepts rope lengths below 0.8 m; they only work correctly above about 0.1 m.

## 4. Defects found and fixed in the kinematic adapter

| Defect                                                                                                    | Before                           | After               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------- |
| Rope held outside its circle by a solid snapped the pendulum to the circle with an inflated angular speed | 22 m/s phantom speed at rest     | under 1 m/s         |
| Same case, pull blocked, velocity left unchanged                                                          | speed grew with gravity          | follows real motion |
| Body already overlapping an end cap or face kept sinking                                                  | 0.12 m (tunnel), 0.056 m (wedge) | 0                   |
| Ceiling clipping a swing: rope stretch                                                                    | 0.24 m                           | 0.105 m             |

All existing conformance tests still pass (kinematic and planck).

## 5. Level authoring rules

Derived from the measurements; the numbers include a margin over what was verified.

1. **Wall and floor thickness.** Any thickness collides correctly (0.02 m was tested at 80 m/s). Author
   at least 0.1 m so art, collision and the player's eye agree; use 0.25 m or more for anything the
   player is meant to read as a wall. Collision is authored data, art aligns to it (doc 07A).
2. **Tunnel and gap width.** The body is 0.7 m across. Production passages must have at least
   **0.8 m clear width**, enforced for v2 declared tunnels by `npm run levels:validate` in the
   [level authoring pipeline](level-pipeline.md) (GMR-39). The measured 0.72 m clearance in the
   stress lab demonstrates collision behavior; it is not the production authoring target.
   Anything under 0.65 m is a wall.
   Never author 0.66 to 0.74 m: the outcome depends on a 1e-4 m skin and the approach angle.
   Add 0.1 m of headroom if the player is expected to run (not crawl) through.
3. **Seams.** Abutting tiles are safe. Prefer merging collinear tiles into one solid, and keep steps
   between tiles at 1 mm or less when they are meant to be flush. Anything between 1 mm and 0.35 m is
   a visible step that deflects the circle upward.
4. **Sharp corners.** Convex corners are safe (90 degree block corners tested at every approach angle and offset; sharper tips take the same end-cap path). Avoid concave
   crevices narrower than 0.7 m at their mouth (the player wedges in and cannot jump out).
5. **Ceilings above swings.** Leave at least 0.5 m between the top of the arc and any ceiling unless
   the clip is intended. A clip slides the body and the rope visibly stretches up to about 0.1 m.
6. **Anchors near geometry.** An anchor 0.4 m from a wall is allowed (impact radius), but the swing
   arc that crosses that wall is held by it. Keep at least 2r (0.7 m) between the arc and any wall
   the player is not meant to hit, and never place an anchor so that every reachable body position is
   closer to a wall than L.
7. **Line of sight.** The rope press is rejected as `blocked` when geometry sits between the player
   and the impact point; the rope passes through geometry afterwards, so thick walls near an arc
   behave as in rule 6, not as rope wrap.
8. **Hazards.** Hazard strips can be 0.05 m thick and still always register. A release point needs
   no extra margin for tunneling; keep 0.35 m (one radius) between the release point and a hazard if
   the player should not die on release without moving.
9. **Rope lengths.** Anchors closer than 0.8 m or farther than 11 m from the player are rejected by
   the sim; do not rely on the adapter handling other lengths.
