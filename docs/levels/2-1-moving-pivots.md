# Level 2-1 "Moving Pivots" (GMR-72)

**Teaching goal (doc 14):** predict where a pivot will be, not where it is.
**Introduces:** horizontal and vertical moving anchors (GMR-26 envelope), riding a mover while attached, a hand-off between two movers, a spiked low corridor, and a harder horizontal slot exit.
**Challenge families:** moving-anchor intercept, moving-anchor ride, multi-anchor chain, narrow corridor.
**Exit:** horizontal slot, 0–10°, 3–8 m/s, middle 40% of the mouth.
**Difficulty position:** first level of Section 2, a step up from 1-3. Designed by Opus; the solver numbers are below.

**Scope ruling (Opus):** the GMR-72 issue lists _timed anchors_. They have no sim support yet (doc 09 H3 reserves their look), so they move to GMR-60, the advanced anchors issue. 2-1 teaches movers only. Timed anchors debut in 2-2 or later, once they exist.

## The rule the level teaches

A moving anchor keeps moving after you connect. The rope length is fixed at connection (doc 04), so **where the pivot goes next** decides your arc. Connect while the pivot moves _with_ you and it carries you. Connect while it moves _against_ you or _drops_, and your swing sinks. Every chamber puts a different hazard on each side of the right timing, so the death tells you which way you were wrong.

## Chambers

Bands as in [docs/level-pipeline.md](../level-pipeline.md): generous ≥ 12, standard 6–11, tight 3–5, expert ≤ 2 ticks. For a mover, a press window is also a fraction of the cycle (shown in brackets). Missing it means waiting for the next pass, not a harder input.

| #   | Name             | Problem                                                                                                                                                                                                                                                               | Family                  | Target   |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| C1  | Ferry            | One slow horizontal mover (a1, 8 m span, 5 s) over a 12 m gap. Safe: nothing kills you except the ink. The player sees the pivot slide and learns to connect while it is ahead.                                                                                       | moving-anchor intercept | generous |
| C2  | Lift             | A vertical mover (a2, 4.5 m, 4 s) over a spike bed, with a spiked low ceiling over the landing. Connect while it is low and rising and it lifts you clear. Connect at the top and the falling pivot drops you onto the spikes. A late, high release hits the ceiling. | moving-anchor intercept | standard |
| C3  | Ride             | A long mover (a3, 16 m, 7 s) carries you across a spiked pit. Connect on the ground (the low ceiling of C2 rules out a jump) and let it carry you. Let go before it turns back, or the wall spikes and the pit wait.                                                  | moving-anchor ride      | standard |
|     | **Checkpoint A** | on the C3 landing (x 84), before the 1 m passage under the wall                                                                                                                                                                                                       |                         |          |
| C4  | Hand-off         | Horizontal mover a4a to vertical mover a4b, with a spiked block floating between them. Release a4a so a4b is low when you reach it. A high arc meets the block's spikes, and a4b at the top drops you into the pit spikes.                                            | multi-anchor chain      | standard |
|     | **Checkpoint B** | on the C4 landing (x 124)                                                                                                                                                                                                                                             |                         |          |
| C5  | Low corridor     | A horizontal mover (a5) 1.2 m under an 18 m spiked ceiling over the ink. Swing low and release early and flat. A late release rises into the ceiling. The level's hardest moment.                                                                                     | narrow corridor         | tight    |
| C6  | Slot             | Run into the slot from the landing. Horizontal, at run speed or slower (no speed streaks), between the gate dots.                                                                                                                                                     | exit                    | standard |

**Checkpoints:** three groups (C1–C3, C4, C5–C6), so a death never replays more than 3 chambers (doc 14 §2).

## Mastery route (optional)

`m4` is a static anchor high above C4's floating spike block, at (106, −3.5). From a4a, release late and high, connect to m4 and swing over the block straight onto the C4 landing, skipping a4b. Verified with the solver on a copy of the level with a4b removed: it crosses C4 via a4a → m4 with **3-tick** windows. It's worth a time medal (GMR-65) and is never required. With all anchors present, the solver's main route ignores m4.

## Route solver results (GMR-101)

`npm run levels:solve -- 2-1` solves the whole level in about 17 s (route 1184 ticks, 19.7 s). The replay is committed as `content/solutions/2-1.json`, and the fixture test replays it on every `npm run test`.

| Chamber | Lesson input (window)             | Tightest on route      | Band     | Target   | Note                                                                                                                                  |
| ------- | --------------------------------- | ---------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| C1      | a1 press 26 t (≈9% of the cycle)  | move 6                 | generous | generous | Intro.                                                                                                                                |
| C2      | a2 press 14 t (≈6%), release 24 t | hop before the pit 5 t | generous | standard | Deviation, see "C2" below.                                                                                                            |
| C3      | a3 press 29 t (≈7%), release 57 t | 29 t                   | generous | standard | Deviation: the first ride is kept generous so riding can be learned on its own. The pit spikes still punish a deep (late) connection. |
| C4      | a4a release 9 t, a4b press 27 t   | 9 t                    | standard | standard |                                                                                                                                       |
| C5      | a5 release 5 t                    | 5 t                    | tight    | tight    | The section's peak.                                                                                                                   |
| C6      | none (run into the slot)          | –                      | –        | standard | No timed input: see "C6" below.                                                                                                       |

**C2 deviation (generous instead of standard).** In ticks, the a2 press window is 14 (generous). As a share of the lift's 4 s cycle it is about 6%: the player has to read the phase (low and rising), and that phase is what this chamber teaches. Shrinking the window further would add a reflex test on top of a new prediction skill, which makes it harder to tell why an attempt failed. The 5-tick run-up hop below is a measurement artifact. Re-check C2 in the first playtest; tighten it (pit spikes up 0.1–0.2 m) only if it is solved by accident.

**C6 (no measured window).** The slot is entered by running in from the C5 landing, so the solver needs no timed input and no window exists. Its difficulty is spatial: the gate band (middle 40% of a 1 m mouth), 0–10°, at most 8 m/s. Those are checked by the exit rules and explained by the GMR-56 signage and the miss text. The level's last timed challenge is C5 (tight).

**Run-up hops (C2, 5 t).** The solver measures each input while holding the others fixed. Shifting the hop before C2 while the rope press stays on the same tick changes where you are when you connect. A player re-times both together, so the lesson window is the a2 press (14 t). Playtests should confirm C2 doesn't feel tight.

**Cycle fractions.** On a mover, the useful press window is a small slice of each cycle (6–9%). That is the "predict the pivot" skill. It isn't punishing, because the pivot comes back: a missed slice costs a few seconds of waiting, not a death.

## Death causes the player must be able to explain

- **spikes! (low)**, in the C2 pit and the C3 pit: connected while the pivot was moving away or dropping, so the arc sank.
- **spikes! (high)**, on the C2 ceiling, the C4 floating block and the C5 ceiling: released late, or rode too high.
- **spikes! (wall)**, at the C3 wall: held the ride past the landing.
- **red ink**, in C1, C4 and C5: released early or never connected.
- **slot miss**, in C6: arrived steep or off-centre. The gate dots and the cone (GMR-56) show the rule.

## Tooling

`npm run levels:plot -- 2-1 [--x min max]` draws the collision, hazards, anchor paths, checkpoints and the committed solver route (rope lines, connect/release dots) as an SVG in `node_modules/.cache/plots/`. It was added for this level. The first plots found a missing floor under the C3 wall that the solver was escaping with a rope.

## Build notes

- Geometry is v2 level data (`content/levels/2-1.json`). Collision comes first; art comes from the kit. Spike strips carry `visualPoints` inside their hazard rectangles.
- The passage under the C3 wall is 1 m tall (≥ 0.8 m); the floor runs under it.
- Mover envelope (GMR-26): peak speed ≤ 7.2 m/s (a3), peak acceleration ≤ 8.8 m/s² (a2/a4b). The parser enforces both.
- Telemetry ids: `2-1`, chambers `2-1-c1` … `2-1-c6`, checkpoints `2-1-cpA`, `2-1-cpB`, exit `2-1-exit`.
- Not verified here: human feel, camera framing at m4 (y −3.5) and in the C5 corridor, art/audio pass (Section 2 theme), native-device play.
