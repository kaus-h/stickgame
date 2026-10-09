# Level 1-3 "First Threat" (GMR-59)

**Teaching goal (doc 14):** movement is combat; pivots can move.
**Introduces:** patroller stomp/rebound, horizontal moving pivots, enemy-assisted traversal, vertical shaft exit.
**Challenge families:** stomp, enemy-assisted route, moving-anchor intercept, rope length, release, exit-entry problem.
**Difficulty position:** mostly standard (6–11 ticks), two tight late chambers (3–5), no expert input on the main route. C1's jump is deliberately generous; its rebound steering is tight.

## Constraints and evidence plan

Only Move/Jump/Rope, shot-defined rope length, preserved release momentum, deterministic 60 Hz simulation, instant death/retry, standard assist mode. No global tuning, sim logic or existing replay golden changes. Seven chambers and two checkpoints follow doc 14's 6–10 chamber and 2–3 chamber grouping. Geometry, enemies, telemetry and the exit are v2 data.

Before building, the open questions were moving-pivot phase, stomp placement, release timing, camera visibility and the optional shortcut. Evidence is the real route solver's timing sweeps, committed main/mastery replays, sim tests and browser playthroughs. Human first-clear duration, native-device feel and mastery aim fairness remain playtest questions. No canon default is promoted to locked here.

## Movement metrics used for layout

The 1-1 movement table still applies. Enemy rebounds are authored at 15 m/s upward, with a 1 m/s minimum downward stomp speed. All three main-route stomps preserve incoming horizontal velocity: g1 at tick 88 (4.83 m/s), g2 at tick 333 (7.50 m/s), g7 at tick 1162 (7.50 m/s). Each rebound becomes the next traversal arc, rather than a combat pause.

| Pivot | Locked rope | Lock → release | Hold   | Layout purpose                                          |
| ----- | ----------- | -------------- | ------ | ------------------------------------------------------- |
| a2    | 3.97 m      | 272 → 310      | 0.63 s | Drop onto the pillar goon and use its height            |
| a3    | 7.61 m      | 491 → 540      | 0.82 s | First horizontal moving pivot; jump before catching     |
| a4    | 3.77 m      | 676 → 718      | 0.70 s | Short, fast swing between floor teeth and hanging teeth |
| a5    | 7.33 m      | 820 → 927      | 1.78 s | Longer, slower hold after intercepting a faster pivot   |
| a6    | 8.86 m      | 1002 → 1058    | 0.93 s | Long arc with a timed release into a low pocket         |
| a7    | 7.60 m      | 1228 → 1276    | 0.80 s | Finale rebound, moving pivot, then shaft entry          |

Grounded shots a4, a6 and a7 pay out until take-off; these are **locked** lengths, not their earlier connection lengths. The static a4 swing breaks the moving-pivot rhythm; adjacent ropes and holds vary without changing the rope rules. Moving paths stay within production limits: a3 traverses 8 m in a 5 s cycle, a5 10 m in 4.4 s, a7 6 m in 5 s.

## Chambers and route solver results

`npm run levels:solve -- 1-3` solves the original level from spawn in about 2.6 s, producing a **1308-tick / 21.80 s death-free replay**. The fixture is `content/solutions/1-3.json`; the normal fixture suite replays it on every test run. Windows sweep one input while keeping the others fixed, so they describe this route, not every possible route or human difficulty.

| Chamber | Name / stated problem                                                 | Family             | Tightest jump/rope input      | Window   | Band     | Clear tick |
| ------- | --------------------------------------------------------------------- | ------------------ | ----------------------------- | -------- | -------- | ---------- |
| C1      | Stomp the patroller and ride its rebound over a wall too tall to jump | stomp introduction | jump press, tick 48 (−14…+15) | 30 ticks | generous | 184        |
| C2      | Drop onto the pillar goon and rebound to the high ledge               | enemy-assisted     | a2 press, tick 272 (−3…+4)    | 8 ticks  | standard | 455        |
| C3      | Jump, catch the first horizontal moving pivot and ride across         | moving pivot       | jump press, tick 458 (−3…+3)  | 7 ticks  | standard | 638        |
| C4      | Connect close for a short fast swing between floor and hanging teeth  | rope length        | a4 release, tick 718 (−5…+5)  | 11 ticks | standard | 816        |
| C5      | Intercept a faster pivot during the reachable part of its run         | moving intercept   | a5 press, tick 820 (−4…+5)    | 10 ticks | standard | 979        |
| C6      | Time the release into a low pocket between spikes                     | release            | a6 release, tick 1058 (−2…+2) | 5 ticks  | tight    | 1123       |
| C7      | Stomp for height, catch the mover and drop into the shaft             | Section 1 finale   | a7 release, tick 1276 (−1…+2) | 4 ticks  | tight    | 1308       |

The solver's chamber summary excludes movement-axis trims. `tests/unit/level13.test.ts` also remeasures all four C1 axis changes against the original goal, with the solver's 120-tick deadline slack and ±40-tick scan: tick 0 has 7 ticks, reverse at 72 has 4, neutral at 76 has 6, forward at 108 has at least 66 (scan-capped). **Every measured main-route input, including steering, has at least 4 ticks.** C1's brief reverse at tick 72 has a 4-tick window: the introduction's jump is generous but the rebound steering is tight. Thus the full-input reading has **three tight chambers**, four standard, and none expert; the jump/rope reading has two tight chambers. C3 and C5 windows are clipped by the preceding chamber boundary and are lower bounds. C7's wider 1.8 m goon replaces the draft's 1.2 m surface: it removes a one-tick steering stop while retaining a 4-tick shaft-release challenge. This is local level tuning, not an enemy-system change.

**Checkpoint A:** (82, 6.65), after C3, before C4.
**Checkpoint B:** (128, 5.65), after C5, before C6.
Groups are C1–C3, C4–C5, C6–C7; death restarts immediately from the latest checkpoint, never through results or an interstitial.

**First-clear target:** doc 14's 3–6 minutes for a competent player, excluding retries, remains unverified. The solver is a rehearsed speed route, not a first-clear measurement. The compact seven-chamber scale follows 1-1 and 1-2; adding walking or waiting purely to inflate duration would weaken their pattern. Keep this deviation visible for owner playtesting rather than claim the target is met.

## Mastery route (optional)

After g1's rebound, briefly land on the wall top, catch **m1** at (26, −2), swing through the 1.05 m spike opening, then catch a2 from above and land on C2's high ledge without stomping g2. The ground route has a separate 1.1 m underpass; the mastery gate never blocks the standard floor run. At the gate the verified shortcut travels about 17.18 m/s horizontally.

`docs/levels/1-3-mastery-route.json` contains the reproducible replay and measured windows. A search copy merged C1/C2's goal and removed g2 to discover the shortcut; **the retained replay is tested against the original level with all three goons and all seven chamber goals**. It completes in **1186 ticks / 19.77 s**, saving 122 ticks / 2.03 s (9.3%). It uses m1 and leaves g2 alive. m1's press window is 4 ticks, but later steering/jump trims include 1-tick expert windows. These belong only to the optional route. The committed main route ignores m1.

## Exit and failure readability

The 1.6 m-wide shaft accepts top entry, 0–25° from downward, 20–28 m/s, alignment 0.03–0.97. These are authored thresholds, not canon changes. The main replay's final release preserves velocity (10.82, −2.40) m/s before gravity turns the arc into the shaft descent. Success and results happen only after the accepted crossing.

- **goon:** side/underside contact or an unsafe top approach. The dangerous red edges and the death marker explain the contact; a clean top stomp gives upward rebound and the existing stomp sound.
- **red ink:** missing a crossing or releasing without enough height.
- **spikes!:** floor versus hanging teeth in C4, pocket face versus roof in C6, right-wall teeth at the shaft, or the optional mastery gate. The last-rope trace shows the failed arc.
- **shaft miss:** a wrong entry angle, speed or alignment produces the existing crossing marker; it does not invent a pre-exit result screen.

## Art, audio and build notes

Collision is authored first. Existing notebook page rendering provides black pen outlines/hatching and red ballpoint hazards; goons use the production procedural drawing and stomp sound from GMR-45. Spike silhouette points stay inside their hazard rectangles. This level adds no bitmap, sampled sound or reference-art copy; its original layout has a provenance row.

Required-anchor tags cover a2, a3, a4, a6 and a7. a3's tag is the airborne catch locus, not the ledge floor. a5 deliberately has no all-phase `requiredFrom` tag: it is reachable only during part of its path. Browser checks inspect the actual moving-pivot shots instead of claiming all phases are reachable. Camera bounds include the shaft floor and the raised finale pivot; mobile shares the same geometry and simulation.

The C6 pocket is 1.6 m tall, the shaft 1.6 m wide, and the optional mastery opening/ground underpass 1.05/1.1 m; all exceed the 0.8 m production clearance. Main blocking walls are at least 0.4 m thick; the 0.3 m mastery strip is a hazard, not a structural wall.

Telemetry ids: level `1-3`; chambers `1-3-c1`…`1-3-c7`; checkpoints `1-3-cpA`, `1-3-cpB`; exit `1-3-exit`; goons `g1`, `g2`, `g7`. Chapter 1 slot 3 is authored and unlocks after 1-2; clearing it ends the currently authored Section 1 sequence. Results never precede the exit.

Not verified: human first-clear duration, subjective stomp/aim feel, native hardware and thumb reach. Automated replay/camera/audio checks are evidence for implementation, not a substitute for those playtests.
