# Level 1-2 "Release" (GMR-58)

**Teaching goal (doc 14):** release timing decides the destination.
**Introduces:** static spikes, the ceiling constraint, the first multi-anchor chain, the horizontal slot exit.
**Challenge families:** release problem, ceiling constraint, multi-anchor chain, impact-point problem.
**Exit:** horizontal slot.
**Difficulty position:** a step up from 1-1 (measured 26/18/13/9/17 ticks). Mostly standard windows (6–11 ticks), one tight late chamber, nothing expert on the main route.

## Movement metrics used for layout

All numbers come from `content/tuning/runtime.json`. The 1-1 table still applies. 1-2 relies on these extra facts, measured with the real simulation:

| Metric                            | Value                          | Layout consequence                                                                                                                                                         |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swing energy from a running start | about 0.9 m above take-off     | A swing that leaves the ground running cannot land on anything more than about 0.9 m above its take-off. Higher targets need a jump first.                                 |
| Air control                       | 40 m/s², 7.5 m/s cap           | The player steers hard after a release, so horizontal distance is forgiving. Release timing is made to matter **vertically**: height bands between spikes above and below. |
| Late release                      | higher arc, less forward speed | Early release = low, flat flight. Late release = high, steep flight. Every release chamber puts a different hazard on each side so the death tells you which one you did.  |
| Grounded connection               | rope pays out until take-off   | Connecting on the ground and running off a fixed edge gives a fixed rope length. 1-2 C5 uses that to isolate the impact point.                                             |
| Jump apex                         | 2.6 m                          | A ceiling 1.8 m above the floor kills a jump. C3 and C5 use that to rule out the jump-then-connect fix from 1-1 C4.                                                        |
| Anchor disc radius                | 0.4 m (default), 1.4 m for a5  | On the big disc, aiming its near rim instead of its centre shortens the rope by about 1 m.                                                                                 |

## Chambers

Every chamber has one stated problem, written as the `problem` field in the level data. Bands as in [docs/level-pipeline.md](../level-pipeline.md): generous ≥ 12, standard 6–11, tight 3–5, expert ≤ 2 ticks. Spikes are hazard solids with spike `visualPoints` and ids containing `spikes`, so the death label reads "spikes!".

| #   | Name             | Problem                                                                                                                                                                                                                                                                                           | Family                 | Window target |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------- |
| C1  | Teeth            | Hop a small row of floor spikes, then rope across an 8 m gap. Introduces spikes in a safe place.                                                                                                                                                                                                  | spikes (intro)         | generous      |
| C2  | The mouth        | **Pure release timing.** One anchor (a2). The far ledge is guarded by spikes on its face below the lip and by a spiked block hanging just above the approach. Same anchor, same rope: release early and you fly flat into the **low** spikes; release late and you rise into the **high** spikes. | release                | standard      |
| C3  | Low ceiling      | A spiked ceiling 1.8 m above the floor: a jump kills, so the player has to connect on the ground and run off. Holding the rope too long swings you up into the ceiling; letting go too early drops you into the red ink.                                                                          | ceiling constraint     | standard      |
|     | **Checkpoint A** | on the C3 landing (start of C4)                                                                                                                                                                                                                                                                   |                        |               |
| C4  | Chain            | The first three-anchor chain (a4a, a4b, a4c) over a 30 m pit. Spiked blocks hang between the anchors, so a late release that flies high hits them; an early one drops into the ink. Each release sets up the next connection.                                                                     | multi-anchor chain     | standard      |
| C5  | Big disc         | **Impact point.** A low roof stops the jump; the anchor a5 is a big disc (1.4 m radius) over a spike bed. The rope length is fixed by the take-off edge, so the only choice is where on the disc you aim: the centre or far side dips into the spikes, only the **near rim** clears them.         | impact point           | standard      |
|     | **Checkpoint B** | on the C5 landing (start of C6)                                                                                                                                                                                                                                                                   |                        |               |
| C6  | Teeth corridor   | Two anchors (a6a, a6b) between a spiked ceiling and spiked stalagmites. A long swing hits the stalagmites, a high release hits the ceiling. The section's hardest moment.                                                                                                                         | multi-anchor + ceiling | tight         |
| C7  | Slot             | One rope (a7) over a spike pit onto a short runway, then run straight into the horizontal slot. The slot accepts a horizontal entry from the left (0–12°, 3–8 m/s, mid-height of the opening).                                                                                                    | exit                   | standard      |

**Checkpoints:** three groups (C1–C3, C4–C5, C6–C7), so a death never replays more than 3 chambers (doc 14 §2).

**Slot speed cap.** The slot accepts up to 8 m/s, not the 7.5 m/s of `lab-exit-slot`. A player who lands on the runway right before the slot can arrive at 7.501 m/s (release momentum not yet bled off) and was rejected for "speed" while simply running. The cap is authored tuning (docs/compartment-exits.md), not canon.

**First-clear target:** about 4 to 5 minutes for a competent platformer player who has cleared 1-1. It is measured in playtests, not promised.

## Mastery route (optional)

`m4` hangs high above C4's chain at (100, −3). From a4a, release late and high, connect to m4 and swing over the second spiked block straight onto C4's far ledge, skipping a4b and a4c. Verified with the route solver by removing a4b and a4c from a copy of the level: it reaches the far ledge via a4a → m4 with a **2-tick** window (expert). It's worth a time medal (GMR-65), never required. With all anchors present the solver's main route ignores m4 and uses the intended chain.

## Route solver results (GMR-101)

`npm run levels:solve -- 1-2` solves the whole level from the spawn in 3.5 s (route 1294 ticks, 21.6 s). The solution replay is committed as `content/solutions/1-2.json`, and the fixture test replays it on every `npm run test`.

| Chamber | Tightest input on the solver route | Window   | Band     | Target   | Note                                                                                                                                                                                  |
| ------- | ---------------------------------- | -------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1      | jump press (spikes)                | 19 ticks | generous | generous | Start-clipped, lower bound. The a1 rope press has 38 ticks.                                                                                                                           |
| C2      | rope release on a2                 | 10 ticks | standard | standard | Single grounded connection, single release. Sweep around the solver release: −29…−5 dies on `c2-spikes-face` (early), −4…+5 clears, +6…+30 dies on `c2-spikes-hang` (late).           |
| C3      | rope release on a3                 | 9 ticks  | standard | standard | Grounded connection (press window 67). Early release → red ink; late release or holding on → `c3-spikes-ceiling`.                                                                     |
| C4      | rope release on a4b                | 10 ticks | standard | standard | Uses all three anchors, a4a → a4b → a4c. Late a4b release hits `c4-spikes-hang-2`, early drops into the ink. The solver steers back left in the air for a moment between a4a and a4b. |
| C5      | rope press on a5                   | 24 ticks | generous | standard | Deviation, see below. The solver aims at the near rim (impact offset 2).                                                                                                              |
| C6      | rope press on a6b                  | 3 ticks  | tight    | tight    | The solver hops before the ceiling starts, connects a6a, then a6b, and re-shoots a6b once. a6a release is 5 ticks: early → stalagmites, late → ceiling.                               |
| C7      | rope release on a7                 | 11 ticks | standard | standard | Then a run into the slot; the exit accepts the entry.                                                                                                                                 |

**C5 deviation (generous instead of standard).** C5's challenge is spatial, not temporal: it is the aim that has to be right. A grid over every press tick (grounded and just after the edge) × the solver's five impact points × every release tick shows that **only the near-rim aim** ever reaches the far ledge; the centre, far rim, top and bottom of the disc never do, whatever the timing. With the near-rim aim, any grounded press works and about 21 release ticks land. Tightening the timing on top of a new aiming skill would make a failed attempt ambiguous (bad aim or bad timing?), which works against the acceptance criterion that the player can tell what went wrong. Tighten only if playtests show C5 is solved by accident.

**Release readability.** The acceptance criterion "a player can tell whether they released early or late" is met by placing a different hazard on each side of every release window: C2 low spikes vs hanging spikes, C3 red ink vs ceiling spikes, C4 red ink vs hanging spikes, C6 stalagmites vs ceiling. The death label, death cross and last-rope trace show which side you hit.

## Death causes the player must be able to explain

- **spikes!** (any `*-spikes-*` hazard). Low spikes = released early (C2) or swung too long (C6). High spikes = released late or swung too high (C2, C3, C4, C6).
- **red ink** (fell into the floor). Released too early in C3 and C4.
- **rope too long** (C5, swinging into the spike bed). The last-rope trace shows the deep arc; the fix is aiming at the near rim.
- **slot miss** (C7, arriving too steep or off-centre). The GMR-46 crossing marker explains the rule; the player walks back and runs in again.

## Build notes

- Geometry is authored as v2 level data (`content/levels/1-2.json`). Collision is first; art comes procedurally from the collision (style bible §4). Spike strips carry `visualPoints` that stay inside their hazard rectangles.
- Walls are at least 0.4 m thick; the only intended passage is the 1 m-tall slot (≥ 0.8 m).
- The C4 spiked blocks float (y 1 to 5.7) so the mastery corridor above them stays open.
- Telemetry ids: `1-2`, chambers `1-2-c1` … `1-2-c7`, checkpoints `1-2-cpA`, `1-2-cpB`, exit `1-2-exit`.
- Not verified here: human feel, camera framing at m4 (y −3) and in the C6 corridor, and native-device play.
