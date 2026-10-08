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

| #   | Name             | Problem                                                                                                                                                                                                                                                                             | Family                             | Window target |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------- |
| C1  | Paper's edge     | Run and jump a 3.5 m gap over red ink. Proves the floor kills and the jump is enough.                                                                                                                                                                                               | low floor (intro)                  | generous      |
| C2  | First rope       | A 9 m gap with one anchor high in the middle. Any sensible connect-and-release crosses it. The red floor is far below, so a late release still clears.                                                                                                                              | rope (intro)                       | generous      |
| C3  | Catch yourself   | Same gap shape, but the far ledge is higher. A short swing falls short, and a low **recovery anchor** under the far ledge catches a falling player and lifts them up. Teaches that a second rope saves you.                                                                         | recovery                           | generous      |
|     | **Checkpoint A** | on the C3 ledge                                                                                                                                                                                                                                                                     |                                    |               |
| C4  | Too long         | The anchor is high above a pit whose red floor sits close below the swing. Connecting early from the ledge gives a long rope whose arc dips into the red ink. The fix is to jump toward the anchor first and connect near the apex, so the rope is shorter and the arc stays clear. | rope-length                        | standard      |
| C5  | Too short        | The far ledge is farther than a short swing reaches. Here a _long_ rope is needed: connect on the ground while running away from the anchor's foot and leave late, so the rope pays out and locks long. This is the same anchor idea reversed.                                      | rope-length                        | standard      |
|     | **Checkpoint B** | after C5                                                                                                                                                                                                                                                                            |                                    |               |
| C6  | Low floor run    | Two anchors over a long, low-ceilinged stretch with red ink below. Release from the first at the right moment to connect the second. The swing must stay between the ceiling and the floor, so both connection timings matter.                                                      | rope-length + low floor (compound) | tight         |
| C7  | Wide compartment | Swing in and arrive inside a wide compartment opening. The arrival is judged (GMR-46): enter from the open side, below the speed cap.                                                                                                                                               | exit                               | standard      |

**Checkpoints:** three chamber groups (C1–C3, C4–C5, C6–C7), so a death never replays more than about 3 chambers (doc 14 §2).

**First-clear target:** about 3 to 4 minutes for a competent platformer player. It is measured in playtests, not promised.

## Mastery route (optional)

A high anchor above C6's ceiling, reachable only from C5's far ledge with a late, short connection (expert window). It skips C6's chain and drops straight into C7's compartment. It's worth a time medal (GMR-65), never required.

## Death causes the player must be able to explain

- **red ink** (fell into the floor). The GMR-43 label after repeats reads "red ink = danger".
- **fell off the page** (out of bounds below the pit).
- **rope too long** (C4, swinging into red ink). The last-rope trace and death cross show the arc.
- **rope too short** (C5, short of the ledge). The ghost of the previous attempt shows how far it got.

## Build notes

- Geometry is authored as v2 level data (`content/levels/1-1.json`). Collision is first; art comes procedurally from the collision (style bible §4).
- Every chamber must be solved by the route solver (GMR-101). Its solution replay is committed as a regression fixture, and its measured windows are recorded in the table above before playtests.
- Telemetry ids: `1-1`, chambers `1-1-c1` … `1-1-c7`, checkpoints `1-1-cpA`, `1-1-cpB`.
