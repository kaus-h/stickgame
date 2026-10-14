# Level 1-1 "First Rope" (GMR-57)

**Teaching goal (doc 14):** Move, Jump, Rope. _When_ you connect sets the rope length, and the length decides where the swing goes.
**Introduces:** static anchors, the lethal floor (red ink), recovery anchors, connection timing → rope length.
**Challenge families:** rope-length, low floor.
**Exit:** wide compartment.
**Difficulty position:** the first level. Approachable, but by its last chambers the player must time connections on purpose (doc 14 §3a).

## Movement metrics used for layout

All numbers come from `content/tuning/runtime.json`.

| Metric                           | Value       | Layout consequence                                                                                                                             |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Run speed                        | 7.5 m/s     |                                                                                                                                                |
| Jump apex                        | 2.6 m       | Steps up to 2 m are jumpable; a 2.5 m wall needs a perfect jump                                                                                |
| Air time on a flat jump          | 0.75 s      |                                                                                                                                                |
| Flat jump distance at full speed | 5.6 m       | Gaps ≤ 4.5 m are safe jumps; ≥ 6 m need the rope                                                                                               |
| Rope length                      | 0.8 to 11 m | Required anchors ≤ 11 m from where they are shot                                                                                               |
| Camera framing (docs/camera.md)  |             | Required anchors ≤ ~7 m above the take-off point                                                                                               |
| Tunnels                          | ≥ 0.8 m     | Walls ≥ 0.25 m thick (docs/collision-policy.md)                                                                                                |
| Swing arc                        |             | The low point is the anchor height + L. A rope connected early from far away is long and dips deep; connected late, it is short and stays high |

## Chambers

Every chamber has one stated problem, written as the `problem` field in the level data. Window targets are what the route solver (GMR-101) must measure. They are proposed bands, calibrated in playtests:

| Band     | Window     |
| -------- | ---------- |
| generous | ≥ 12 ticks |
| standard | 6–11 ticks |
| tight    | 3–5 ticks  |
| expert   | ≤ 2 ticks  |

| #   | Name             | Problem                                                                                                                                                                                                                                                                                            | Family                             | Window target |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------- |
| C1  | Paper's edge     | Run and jump a 3.5 m gap over red ink. Proves the floor kills and the jump is enough.                                                                                                                                                                                                              | low floor (intro)                  | generous      |
| C2  | First rope       | A 9 m gap with one anchor high in the middle. Any sensible connect-and-release crosses it. The red floor is far below, so a late release still clears.                                                                                                                                             | rope (intro)                       | generous      |
| C3  | Catch yourself   | Same gap shape, but the far ledge is higher. A short swing falls short, and a low **recovery anchor** under the far ledge catches a falling player and lifts them up. Teaches that a second rope saves you.                                                                                        | recovery                           | generous      |
|     | **Checkpoint A** | on the C3 ledge                                                                                                                                                                                                                                                                                    |                                    |               |
| C4  | Too long         | The anchor is high above a pit whose red floor sits close below the swing. A rope connected on the ground locks at the ledge edge (8.2 m) and its arc dips into the red ink. The fix is to jump toward the anchor first and connect near the apex, so the rope is shorter and the arc stays clear. | rope-length                        | standard      |
| C5  | Too short        | The far ledge is farther than a short swing reaches. Here a _long_ rope is needed: connect on the ground, then jump early, far from the anchor's foot, so the rope locks long. Running off the edge locks a short rope that falls short. This is C4's idea reversed.                               | rope-length                        | standard      |
|     | **Checkpoint B** | after C5                                                                                                                                                                                                                                                                                           |                                    |               |
| C6  | Low floor run    | The level's peak (GMR-114). A high red pool under a low ceiling, with two anchors. Connect a6a late and close: a long rope dips into the ink. The release flight grazes the ceiling, and a6b, hung low, gives a short, fast whip up onto C7's ledge. After four long swings, the tempo breaks.     | rope-length + low floor (compound) | standard      |
| C7  | Wide compartment | Swing in and arrive inside a wide compartment opening. The arrival is judged (GMR-46): enter from the open side, below the speed cap.                                                                                                                                                              | exit                               | standard      |

**Checkpoints:** three chamber groups (C1–C3, C4–C5, C6–C7), so a death never replays more than about 3 chambers (doc 14 §2).

**First-clear target:** about 3 to 4 minutes for a competent platformer player. It is measured in playtests, not promised.

## Mastery route

**None in 1-1 (removed in the GMR-114 pass, 2026-10-13).** The planned skip hung m6 above C6's ceiling, reachable "from C5's far ledge". A hand search with the real simulation showed that no reachable state carries the energy to get above the slab: with gravity 30 m/s², the highest any a5 release flight gets is y ≈ 1.9, and the slab top is at y −1.6. A visible anchor the player can never use is a broken promise, so m6 is gone. The first mastery route is 1-3's m1. Every future one ships with a replay fixture that proves it (like `docs/levels/1-3-mastery-route.json`).

## Route solver results (GMR-101)

`npm run levels:solve -- 1-1` solves the whole level from the spawn (route 965 ticks, 16.1 s). The solution replay is committed as `content/solutions/1-1.json`, and the fixture test replays it on every `npm run test`.

The solver proves each chamber with _a_ route, not necessarily the one the chamber teaches. The taught routes and the mistakes they correct are pinned by `tests/unit/level11.test.ts` and measured by hand with the real simulation (GMR-114 pass, 2026-10-13).

| Chamber  | Solver route: tightest input     | Window   | Taught route (hand-measured)                                                                                                                     | Band     | Target   |
| -------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| C1       | jump press                       | 26 ticks | same                                                                                                                                             | generous | generous |
| C2 (+C3) | rope press on a2                 | 18 ticks | same. The C2 goal is checkpoint A on C3's ledge, so the a3 rope (33-tick press) counts here. r3 only matters after a short swing.                | generous | generous |
| C4       | rope press on a4 (late, falling) | 5 ticks  | Jump off C3's ledge, then a4 press window 13–35 ticks (wider the earlier you jump). **Every ground-connected press dies.**                       | generous | standard |
| C5       | rope release on a5 (re-grab)     | 8 ticks  | Single long rope: jump anywhere in a 27-tick stretch (locks 7.1–9.9 m), release window 29–35 ticks. **Running off the edge always falls short.** | generous | standard |
| C6       | jump press                       | 11 ticks | a6a press 7, a6b press 17 on the previous route                                                                                                  | standard | standard |
| C7       | none                             | none     | Running only: the swing out of C6 carries the player into the compartment.                                                                       | none     | standard |

**Decisions (GMR-114 level pass, 2026-10-13):**

- **C4 now teaches its lesson.** Before the pass, the pool top sat at y 8.3. A ground connection locks at the ledge edge (8.2 m), and that arc _just_ cleared the ink, so "too long" never killed anyone. The pool rose to y 7.8: ground connections now die, and jump-then-connect survives. The timing stays generous: it is the first chamber where the player must choose _when_ to connect, and the puzzle (jump first) is the lesson.
- **C5 is a puzzle with an easy release.** The insight (leave the ground early for a long rope) is the challenge. The release is forgiving. C5 is the breather between C4's first timing and C6's peak.
- **C6 stays the peak** (pool y 8, a6b at (116, 3.2); see the 2026-10-13 climax pass). Its region now starts at x 92, on the C5 ledge, so the take-off run belongs to the chamber. Before, the solver began C6 already past the edge, and a later C5 arrival left it no jump.
- **Owner direction (2026-10-13):** as the game progresses, difficulty comes from puzzles and timing, not from mechanical execution.

## Death causes the player must be able to explain

- **red ink** (fell into the floor). The GMR-43 label after repeats reads "red ink = danger".
- **fell off the page** (out of bounds below the pit).
- **rope too long** (C4 and C6, swinging into red ink). The last-rope trace and death cross show the arc.
- **rope too short** (C5, short of the ledge). The ghost of the previous attempt shows how far it got.

## Build notes

- Geometry is authored as v2 level data (`content/levels/1-1.json`). Collision is first; art comes procedurally from the collision (style bible §4).
- Every chamber must be solved by the route solver (GMR-101). Its solution replay is committed as a regression fixture, and its measured windows are recorded in the table above before playtests.
- Telemetry ids: `1-1`, chambers `1-1-c1` … `1-1-c7`, checkpoints `1-1-cpA`, `1-1-cpB`.
