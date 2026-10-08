# Moving anchors (GMR-26)

Moving anchors are rope anchors that ping-pong along a straight path. This page records the path
model, the defects found, the measured envelope, the speed and acceleration limits the content
parser enforces, and the rules for authoring them. Gravity is 30 m/s², the sim runs at 60 Hz with 4
physics substeps (kinematic adapter), and the rope rules (doc 04, GMR-22) are unchanged.

Run `MOVING_REPORT=1 npx vitest run tests/unit/moving-anchors.test.ts` to print every table below.
The hands-on level is `content/levels/lab-moving.json`, opened with `?level=lab-moving`.

## Path model

```json
{ "id": "h-mover", "position": [13, 1], "path": { "to": [21, 1], "period": 4, "phase": 0 } }
```

`p(t) = position + (to - position) · (1 - cos(ω (t + phase·T))) / 2`, with `ω = 2π / T` and `t` the
time since the attempt started (`attemptTick · SIM_DT`), so a reset always restarts the motion.

- `period` T: one full there-and-back cycle, seconds.
- `phase` (optional, `[0, 1)`, default 0): where in the cycle the anchor is at tick 0. 0 = at
  `position`, at rest; 0.25 = half-way, at peak speed toward `to`; 0.5 = at `to`, at rest (the
  turn). Labs use it to put a turn on an exact tick: `phase = 0.5 - t_turn / T`.
- Peak speed `= (span / 2) · ω`, peak acceleration `= (span / 2) · ω²` (span = |to - position|).
  Velocity and acceleration are smooth; the anchor eases into each turn.
- `src/sim/anchorPath.ts` (`anchorPathState`) is the single source of the path. The snapshot
  exposes `anchors` (positions) and `anchorVelocities` (path velocity this tick) to render, debug
  (the backtick overlay prints the anchor in play) and later systems. `anchorVelocities` is derived
  from the tick and not hashed.
- The sim hands physics the secant velocity to next tick's path point, so the physics anchor ends
  every step exactly on the path, and reset restores the tick-0 path point bit for bit.

## Defects found and fixed

1. **Pivot travel dropped from the swing (kinematic adapter, major).** `swingStep` measured the rope
   angle from the pivot after it had already advanced this substep, so each substep the body lost
   the pivot's sideways travel. A pivot gliding at constant velocity swung the body as if it were
   being yanked, and a moving anchor drove the swing about twice as hard as the real pendulum (angle
   error 0.06 to 0.3 rad within 2 to 5 s at only 1 to 5 m/s² of pivot acceleration). Fixed by
   measuring from the pivot's position at the start of the substep. Regression: gliding pivot equals
   fixed pivot to 1e-6 m (Galilean invariance).
2. **Pivot acceleration as a radial impulse (kinematic adapter).** The pivot changes velocity once
   per step. Taken as an impulse its radial part either flicked a taut rope slack for a step (pivot
   accelerating toward the body) or was turned into extra swing speed by the momentum-keeping catch
   (pivot accelerating away). Now, while the rope stays in tension under the pivot's acceleration
   over the step (`v_t²/L + (g - a)·n ≥ 0`), the body follows the radial part with the pivot and
   only the tangential part acts on the swing. Regression: a pivot accelerating toward the body at 6
   m/s² never makes the rope slack.
3. **Path drift (sim).** The sim passed the analytic velocity at the start of the tick, leaving the
   anchor `a·dt²/2` off the path each step and snapping it back next tick (1.4 mm at 10 m/s², more
   than the 1 mm taut tolerance). Now the secant velocity is used.

After the fixes the sim tracks an ideal rigid pendulum on the same scripted pivot (RK4, 64 substeps
per tick) to within 0.005 rad over 2 s for every path inside the envelope; the residue is the same
half-tick start offset a fixed anchor shows.

## Limits

| Limit                    | Value            | Enforced by                                                   |
| ------------------------ | ---------------- | ------------------------------------------------------------- |
| Peak anchor speed        | 8 m/s            | `parseLevel` (`MAX_ANCHOR_SPEED`); the error names the anchor |
| Peak anchor acceleration | 12 m/s² (0.4 g)  | `parseLevel` (`MAX_ANCHOR_ACCEL`)                             |
| `phase`                  | `0 <= phase < 1` | `parseLevel`                                                  |

Why these numbers:

- **Acceleration 0.4 g.** A taut rope goes slack from the pivot alone when the pivot's acceleration
  along the rope beats gravity's pull along it: `a > g cos θ`. With `a ≤ 0.4 g` a rope within 66° of
  vertical can never be yanked slack by the pivot, so hanging and normal swings stay taut. Above 12
  m/s² (14.8, 17.5, 26, 39 m/s² measured) the outcome becomes pivot-dominated: outcome sensitivity
  up to 80 (m/s)/m after a 4 s ride (fixed anchor: 10), and on horizontal pivots the swing departs
  from the ideal pendulum by 0.02 to 1 rad within 2 s as small differences get amplified.
- **Speed 8 m/s.** Just above the 7.5 m/s run speed, so a player can chase and line up with any
  anchor. At 8 m/s the anchor moves 0.13 m per tick, well under the 1.1 m selection radius, so a
  held aim keeps the same anchor selected for 8 or more ticks. Release keeps the pivot's velocity,
  so the added release speed is at most about one run speed.
- Both are design limits on the measured envelope, not solver limits: the rope never stretched (max
  3.6e-15 m) at any tested speed, including 12.6 m/s and 39.5 m/s².

## Measured envelope

### Energy, constraint and agreement with the ideal pendulum

Attached on tick 0 with the player at rest at offsets (4,3), (1.8,2.4) and (-4.8,6.4) from the pivot
(rope 5, 3 and 8 m), no input, 10 s (outside-envelope paths: (4,3) only). "E range" is the spread of
mechanical energy over the ride in units of g·L (world frame and the pivot's frame). "Err vs ideal"
compares with the RK4 pendulum on the same pivot over 2 s (and 5 s for the angle). Slack ticks are
over the whole 10 s.

| path                              | L m  | max stretch m | slack ticks | world E range /gL | frame E range /gL | E err vs ideal /gL (2 s) | θ err vs ideal rad (2 s / 5 s) |
| --------------------------------- | ---- | ------------- | ----------- | ----------------- | ----------------- | ------------------------ | ------------------------------ |
| x span 2 T 3 (v 2.1, a 4.4)       | 5.00 | 1.8e-15       | 111         | 1.39              | 1.26              | 0.003                    | 0.005 / 0.005                  |
| x span 2 T 3 (v 2.1, a 4.4)       | 3.00 | 8.9e-16       | 0           | 0.72              | 0.45              | 0.004                    | 0.004 / 0.004                  |
| x span 2 T 3 (v 2.1, a 4.4)       | 8.00 | 1.8e-15       | 17          | 0.69              | 0.76              | 0.001                    | 0.003 / 0.003                  |
| x span 4 T 4 (v 3.1, a 4.9)       | 5.00 | 1.8e-15       | 0           | 1.05              | 0.62              | 0.003                    | 0.005 / 0.005                  |
| x span 4 T 4 (v 3.1, a 4.9)       | 3.00 | 8.9e-16       | 0           | 0.70              | 0.34              | 0.004                    | 0.004 / 0.004                  |
| x span 4 T 4 (v 3.1, a 4.9)       | 8.00 | 1.8e-15       | 0           | 0.22              | 0.17              | 0.001                    | 0.002 / 0.003                  |
| x span 4 T 3 (v 4.2, a 8.8)       | 5.00 | 1.8e-15       | 233         | 2.38              | 1.65              | 0.005                    | 0.005 / 0.439                  |
| x span 4 T 3 (v 4.2, a 8.8)       | 3.00 | 8.9e-16       | 25          | 1.92              | 1.19              | 0.007                    | 0.004 / 0.006                  |
| x span 4 T 3 (v 4.2, a 8.8)       | 8.00 | 1.8e-15       | 175         | 1.20              | 1.33              | 0.001                    | 0.002 / 0.005                  |
| x span 8 T 6 (v 4.2, a 4.4)       | 5.00 | 1.8e-15       | 0           | 0.87              | 0.33              | 0.003                    | 0.005 / 0.005                  |
| x span 8 T 6 (v 4.2, a 4.4)       | 3.00 | 1.3e-15       | 0           | 0.73              | 0.20              | 0.003                    | 0.004 / 0.004                  |
| x span 8 T 6 (v 4.2, a 4.4)       | 8.00 | 1.8e-15       | 0           | 0.33              | 0.17              | 0.001                    | 0.002 / 0.003                  |
| x span 8 T 4 (v 6.3, a 9.9)       | 5.00 | 1.8e-15       | 230         | 2.63              | 1.56              | 0.005                    | 0.005 / 0.609                  |
| x span 8 T 4 (v 6.3, a 9.9)       | 3.00 | 1.3e-15       | 0           | 1.84              | 0.78              | 0.006                    | 0.004 / 0.004                  |
| x span 8 T 4 (v 6.3, a 9.9)       | 8.00 | 1.8e-15       | 0           | 0.94              | 0.66              | 0.001                    | 0.002 / 0.003                  |
| x span 10.5 T 4.2 (v 7.9, a 11.7) | 5.00 | 1.8e-15       | 215         | 2.98              | 1.60              | 0.005                    | 0.005 / 0.636                  |
| x span 10.5 T 4.2 (v 7.9, a 11.7) | 3.00 | 1.3e-15       | 0           | 2.08              | 0.92              | 0.007                    | 0.004 / 0.012                  |
| x span 10.5 T 4.2 (v 7.9, a 11.7) | 8.00 | 1.8e-15       | 0           | 0.92              | 0.55              | 0.001                    | 0.002 / 0.002                  |
| x span 12 T 6 (v 6.3, a 6.6)      | 5.00 | 2.7e-15       | 0           | 1.38              | 0.52              | 0.004                    | 0.005 / 0.005                  |
| x span 12 T 6 (v 6.3, a 6.6)      | 3.00 | 1.3e-15       | 0           | 1.25              | 0.34              | 0.003                    | 0.004 / 0.004                  |
| x span 12 T 6 (v 6.3, a 6.6)      | 8.00 | 1.8e-15       | 0           | 0.40              | 0.20              | 0.001                    | 0.002 / 0.002                  |
| y span 2 T 3 (v 2.1, a 4.4)       | 5.00 | 1.8e-15       | 0           | 0.46              | 0.08              | 0.002                    | 0.005 / 0.005                  |
| y span 2 T 3 (v 2.1, a 4.4)       | 3.00 | 1.3e-15       | 0           | 0.67              | 0.03              | 0.001                    | 0.004 / 0.004                  |
| y span 2 T 3 (v 2.1, a 4.4)       | 8.00 | 1.8e-15       | 0           | 0.28              | 0.05              | 0.001                    | 0.003 / 0.003                  |
| y span 4 T 3 (v 4.2, a 8.8)       | 5.00 | 1.8e-15       | 0           | 0.91              | 0.17              | 0.002                    | 0.005 / 0.006                  |
| y span 4 T 3 (v 4.2, a 8.8)       | 3.00 | 1.3e-15       | 0           | 1.35              | 0.06              | 0.001                    | 0.005 / 0.005                  |
| y span 4 T 3 (v 4.2, a 8.8)       | 8.00 | 1.8e-15       | 0           | 0.56              | 0.10              | 0.001                    | 0.003 / 0.003                  |
| y span 8 T 4 (v 6.3, a 9.9)       | 5.00 | 1.8e-15       | 0           | 1.64              | 0.13              | 0.002                    | 0.005 / 0.005                  |
| y span 8 T 4 (v 6.3, a 9.9)       | 3.00 | 1.3e-15       | 0           | 2.73              | 0.06              | 0.001                    | 0.005 / 0.005                  |
| y span 8 T 4 (v 6.3, a 9.9)       | 8.00 | 1.8e-15       | 0           | 1.06              | 0.08              | 0.001                    | 0.003 / 0.003                  |
| y span 10.5 T 4.2 (v 7.9, a 11.7) | 5.00 | 1.8e-15       | 0           | 2.18              | 0.18              | 0.002                    | 0.005 / 0.006                  |
| y span 10.5 T 4.2 (v 7.9, a 11.7) | 3.00 | 1.3e-15       | 0           | 3.57              | 0.08              | 0.001                    | 0.005 / 0.005                  |
| y span 10.5 T 4.2 (v 7.9, a 11.7) | 8.00 | 3.6e-15       | 0           | 1.37              | 0.09              | 0.001                    | 0.003 / 0.004                  |
| x span 8 T 3 (v 8.4, a 17.5)      | 5.00 | 1.8e-15       | 288         | 3.42              | 2.02              | 0.030                    | 0.043 / 4.768                  |
| x span 12 T 4 (v 9.4, a 14.8)     | 5.00 | 1.8e-15       | 294         | 3.91              | 1.94              | 0.009                    | 0.020 / 6.313                  |
| x span 12 T 3 (v 12.6, a 26.3)    | 5.00 | 1.8e-15       | 115         | 3.88              | 3.07              | 0.755                    | 1.005 / 10.266                 |
| x span 8 T 2 (v 12.6, a 39.5)     | 5.00 | 1.8e-15       | 201         | 7.23              | 4.51              | 0.532                    | 0.426 / 3.293                  |
| y span 12 T 3 (v 12.6, a 26.3)    | 5.00 | 2.7e-15       | 80          | 3.42              | 1.94              | 0.004                    | 0.007 / 0.019                  |
| y span 8 T 2 (v 12.6, a 39.5)     | 5.00 | 2.7e-15       | 146         | 4.49              | 3.82              | 0.041                    | 0.085 / 0.971                  |

Reading it: energy changes are physical (a moving pivot does work on the swing) and match the ideal
pendulum to 0.007 gL within 2 s inside the envelope. Horizontal pivots near the pendulum's own period
(2π√(L/g): 2.0 s at 3 m, 2.6 s at 5 m, 3.2 s at 8 m) pump the swing over several cycles until it goes
over the top and the rope goes slack (slack ticks above); after that the 5 s angle error grows
because the motion is sensitive, not because the solver drifts. Vertical pivots barely change the
swing energy in the pivot frame.

### Predictability: sensitivity to the start state

|Δ release velocity| per metre of start offset (0.1 mm perturbation) after riding 1, 2 and 4 s,
rope 3, 6 and 9 m. A fixed anchor is the baseline. Inside the envelope the 1 s and 2 s values stay
within 3x the fixed anchor and under 12 (m/s)/m: 1 cm of aim or timing moves the release by at most
0.12 m/s (asserted).

| path                                       | L 3 m: 1 s / 2 s / 4 s | L 6 m: 1 s / 2 s / 4 s | L 9 m: 1 s / 2 s / 4 s |
| ------------------------------------------ | ---------------------- | ---------------------- | ---------------------- |
| fixed anchor                               | 2.7 / 5.3 / 10.4       | 2.4 / 2.2 / 5.2        | 1.9 / 1.1 / 2.1        |
| x span 2 T 3 (v 2.1, a 4.4)                | 3.2 / 6.9 / 16.3       | 2.6 / 3.3 / 6.0        | 2.0 / 1.4 / 2.3        |
| x span 4 T 4 (v 3.1, a 4.9)                | 3.3 / 7.2 / 14.2       | 2.6 / 3.8 / 8.1        | 2.0 / 1.7 / 4.7        |
| x span 4 T 3 (v 4.2, a 8.8)                | 3.7 / 8.2 / 44.6       | 2.7 / 4.8 / 5.6        | 2.1 / 2.0 / 2.9        |
| x span 8 T 6 (v 4.2, a 4.4)                | 3.3 / 6.8 / 12.6       | 2.6 / 3.4 / 7.1        | 2.0 / 1.6 / 3.7        |
| x span 8 T 4 (v 6.3, a 9.9)                | 3.9 / 9.0 / 17.8       | 2.8 / 6.1 / 16.4       | 2.2 / 2.4 / 7.1        |
| x span 10.5 T 4.2 (v 7.9, a 11.7)          | 4.1 / 9.8 / 16.1       | 2.9 / 7.2 / 22.6       | 2.2 / 2.7 / 4.2        |
| x span 12 T 6 (v 6.3, a 6.6)               | 3.6 / 7.6 / 13.7       | 2.8 / 4.2 / 8.5        | 2.1 / 1.9 / 4.6        |
| y span 2 T 3 (v 2.1, a 4.4)                | 2.7 / 5.0 / 10.0       | 2.4 / 2.0 / 5.1        | 1.8 / 1.0 / 1.8        |
| y span 4 T 3 (v 4.2, a 8.8)                | 2.8 / 4.7 / 9.5        | 2.3 / 1.9 / 4.9        | 1.7 / 1.0 / 1.7        |
| y span 8 T 4 (v 6.3, a 9.9)                | 2.8 / 5.1 / 7.9        | 2.1 / 1.7 / 3.9        | 1.6 / 1.0 / 1.6        |
| y span 10.5 T 4.2 (v 7.9, a 11.7)          | 2.8 / 5.0 / 7.6        | 2.1 / 1.5 / 3.8        | 1.5 / 1.1 / 1.6        |
| x span 8 T 3 (v 8.4, a 17.5) **outside**   | 4.5 / 10.2 / 80.1      | 2.9 / 8.5 / 10.4       | 2.2 / 3.4 / 3.5        |
| x span 12 T 4 (v 9.4, a 14.8) **outside**  | 4.5 / 11.0 / 41.7      | 3.0 / 9.0 / 14.3       | 2.3 / 3.2 / 4.0        |
| x span 12 T 3 (v 12.6, a 26.3) **outside** | 4.8 / 7.9 / 19.7       | 3.0 / 10.2 / 19.4      | 2.4 / 4.5 / 11.9       |
| x span 8 T 2 (v 12.6, a 39.5) **outside**  | 4.2 / 6.5 / 13.2       | 2.3 / 3.2 / 1.0        | 1.8 / 0.8 / 1.2        |
| y span 12 T 3 (v 12.6, a 26.3) **outside** | 3.1 / 4.6 / 5.0        | 2.0 / 1.3 / 4.9        | 1.4 / 1.4 / 2.0        |
| y span 8 T 2 (v 12.6, a 39.5) **outside**  | 5.7 / 5.0 / 46.9       | 3.3 / 3.1 / 14.0       | 2.3 / 3.4 / 9.9        |

Long rides near resonance get more sensitive even inside the envelope (x span 4 T 3 on a 3 m rope:
44.6 after 4 s); see the authoring rules.

### Attach before vs after a reversal

The pivot turns round at `to` 12 ticks into the attempt; the player (at rest, 4 offsets around the
turn point) attaches on every tick from 0 to 24 and releases after 30, 60 or 90 ticks. Columns: the
largest release-velocity change between neighbouring attach ticks, excluding catch flips and slack
spells; the number of catch-direction flips (and the change there); attach ticks whose ride had a
slack spell.

| path                    | player offset from turn point | hold ticks | max Δv between neighbouring attach ticks, m/s | catch-direction flips (Δv there) | attach ticks with a slack spell |
| ----------------------- | ----------------------------- | ---------- | --------------------------------------------- | -------------------------------- | ------------------------------- |
| fixed anchor            | 3, 3                          | 30         | 0.93                                          | 0                                | 0                               |
| fixed anchor            | 3, 3                          | 60         | 0.67                                          | 0                                | 0                               |
| fixed anchor            | 3, 3                          | 90         | 0.98                                          | 0                                | 0                               |
| fixed anchor            | 1, 5                          | 30         | 0.72                                          | 0                                | 0                               |
| fixed anchor            | 1, 5                          | 60         | 0.69                                          | 0                                | 0                               |
| fixed anchor            | 1, 5                          | 90         | 1.01                                          | 0                                | 0                               |
| fixed anchor            | -2, 4                         | 30         | 0.70                                          | 0                                | 0                               |
| fixed anchor            | -2, 4                         | 60         | 0.79                                          | 0                                | 0                               |
| fixed anchor            | -2, 4                         | 90         | 1.04                                          | 0                                | 0                               |
| fixed anchor            | -3, 3                         | 30         | 0.93                                          | 0                                | 0                               |
| fixed anchor            | -3, 3                         | 60         | 0.67                                          | 0                                | 0                               |
| fixed anchor            | -3, 3                         | 90         | 0.98                                          | 0                                | 0                               |
| x span 8 T 4            | 3, 3                          | 30         | 0.76                                          | 0                                | 2                               |
| x span 8 T 4            | 3, 3                          | 60         | 0.80                                          | 0                                | 2                               |
| x span 8 T 4            | 3, 3                          | 90         | 0.81                                          | 0                                | 2                               |
| x span 8 T 4            | 1, 5                          | 30         | 0.86                                          | 0                                | 0                               |
| x span 8 T 4            | 1, 5                          | 60         | 0.61                                          | 0                                | 0                               |
| x span 8 T 4            | 1, 5                          | 90         | 1.12                                          | 0                                | 0                               |
| x span 8 T 4            | -2, 4                         | 30         | 0.57                                          | 1 (4.6)                          | 0                               |
| x span 8 T 4            | -2, 4                         | 60         | 0.60                                          | 1 (4.6)                          | 3                               |
| x span 8 T 4            | -2, 4                         | 90         | 1.21                                          | 1 (5.0)                          | 5                               |
| x span 8 T 4            | -3, 3                         | 30         | 0.74                                          | 1 (5.4)                          | 0                               |
| x span 8 T 4            | -3, 3                         | 60         | 0.52                                          | 1 (3.9)                          | 8                               |
| x span 8 T 4            | -3, 3                         | 90         | 0.62                                          | 1 (4.3)                          | 11                              |
| x span 10.5 T 4.2       | 3, 3                          | 30         | 0.79                                          | 0                                | 2                               |
| x span 10.5 T 4.2       | 3, 3                          | 60         | 0.61                                          | 0                                | 2                               |
| x span 10.5 T 4.2       | 3, 3                          | 90         | 0.84                                          | 0                                | 2                               |
| x span 10.5 T 4.2       | 1, 5                          | 30         | 0.89                                          | 0                                | 0                               |
| x span 10.5 T 4.2       | 1, 5                          | 60         | 0.64                                          | 0                                | 0                               |
| x span 10.5 T 4.2       | 1, 5                          | 90         | 1.15                                          | 0                                | 0                               |
| x span 10.5 T 4.2       | -2, 4                         | 30         | 0.60                                          | 1 (6.1)                          | 0                               |
| x span 10.5 T 4.2       | -2, 4                         | 60         | 0.55                                          | 1 (5.6)                          | 4                               |
| x span 10.5 T 4.2       | -2, 4                         | 90         | 1.12                                          | 1 (6.3)                          | 7                               |
| x span 10.5 T 4.2       | -3, 3                         | 30         | 0.81                                          | 1 (6.2)                          | 0                               |
| x span 10.5 T 4.2       | -3, 3                         | 60         | 0.60                                          | 1 (4.3)                          | 10                              |
| x span 10.5 T 4.2       | -3, 3                         | 90         | 0.70                                          | 1 (4.6)                          | 13                              |
| y span 8 T 4            | 3, 3                          | 30         | 0.88                                          | 1 (0.7)                          | 2                               |
| y span 8 T 4            | 3, 3                          | 60         | 0.74                                          | 1 (0.6)                          | 2                               |
| y span 8 T 4            | 3, 3                          | 90         | 1.29                                          | 1 (0.5)                          | 2                               |
| y span 8 T 4            | 1, 5                          | 30         | 0.95                                          | 1 (0.3)                          | 2                               |
| y span 8 T 4            | 1, 5                          | 60         | 0.76                                          | 1 (0.4)                          | 2                               |
| y span 8 T 4            | 1, 5                          | 90         | 1.47                                          | 1 (0.3)                          | 2                               |
| y span 8 T 4            | -2, 4                         | 30         | 0.89                                          | 1 (0.4)                          | 2                               |
| y span 8 T 4            | -2, 4                         | 60         | 0.77                                          | 1 (0.5)                          | 2                               |
| y span 8 T 4            | -2, 4                         | 90         | 1.49                                          | 1 (0.3)                          | 2                               |
| y span 8 T 4            | -3, 3                         | 30         | 0.88                                          | 1 (0.7)                          | 2                               |
| y span 8 T 4            | -3, 3                         | 60         | 0.74                                          | 1 (0.6)                          | 2                               |
| y span 8 T 4            | -3, 3                         | 90         | 1.29                                          | 1 (0.5)                          | 2                               |
| x span 12 T 3 (outside) | 3, 3                          | 30         | 1.07                                          | 0                                | 4                               |
| x span 12 T 3 (outside) | 3, 3                          | 60         | 0.63                                          | 0                                | 4                               |
| x span 12 T 3 (outside) | 3, 3                          | 90         | 1.52                                          | 0                                | 4                               |
| x span 12 T 3 (outside) | 1, 5                          | 30         | 1.09                                          | 1 (11.8)                         | 2                               |
| x span 12 T 3 (outside) | 1, 5                          | 60         | 0.55                                          | 1 (4.6)                          | 10                              |
| x span 12 T 3 (outside) | 1, 5                          | 90         | 1.60                                          | 1 (21.7)                         | 10                              |
| x span 12 T 3 (outside) | -2, 4                         | 30         | 1.07                                          | 1 (12.1)                         | 0                               |
| x span 12 T 3 (outside) | -2, 4                         | 60         | 0.61                                          | 1 (5.7)                          | 18                              |
| x span 12 T 3 (outside) | -2, 4                         | 90         | 0.00                                          | 1 (5.5)                          | 25                              |
| x span 12 T 3 (outside) | -3, 3                         | 30         | 2.20                                          | 1 (14.4)                         | 0                               |
| x span 12 T 3 (outside) | -3, 3                         | 60         | 1.17                                          | 1 (6.2)                          | 20                              |
| x span 12 T 3 (outside) | -3, 3                         | 90         | 0.00                                          | 1 (6.0)                          | 25                              |

Release velocity changes smoothly with the attach tick (at most 1.5 m/s per tick inside the
envelope, against a fixed anchor's 1.0 m/s) straight through the reversal. The only larger jumps
(asserted to be the only ones) come from two rope rules that exist with fixed anchors too:

- **Catch direction (resolved during integration).** The original momentum-keeping catch sent all
  the outward speed along the swing in the direction of the relative tangential velocity. When that
  velocity passed through the rope line, attach ticks one apart gave opposite swings (a 4 to 5 m/s
  release jump). The catch is now continuous: the redirected share scales with
  `min(1, |steer| / vr)`, where steer = tangential velocity + horizontal velocity along the tangent,
  so running into a catch swings the way you ran. A head-on catch with no sideways or horizontal
  motion falls back to the plain inelastic catch. Measured: the worst neighbouring-tick release
  change across all reversal cases is 1.9 m/s (asserted below 2), and the run-and-jump momentum
  transfer test still passes.
- **Slack spell.** A ride that goes over the top and slackens re-catches later; whether the catch
  falls before or after the release tick decides the outcome.

### Reset and repeatability

- Restart and death both put every anchor back on its tick-0 path point bit for bit (including a
  `phase` 0.5 anchor), and the next tick equals a fresh simulation (asserted).
- A scripted 600-tick run on `lab-moving` (run, jump, tether to `h-mover`, ride, release, restart)
  gives identical per-tick `hashSnapshot` values when re-run and when driven through the fixed-step
  frame clock with jittered frame times (asserted). The GMR-29 replay and cross-browser drift checks
  cover the `lab-01` moving anchor.

## Authoring rules

1. Keep peak speed ≤ 8 m/s and peak acceleration ≤ 12 m/s²; the parser rejects anything else and
   names the anchor. For span S (m) and period T (s): speed `πS/T`, acceleration `2π²S/T²`, so
   `T ≥ max(0.39·S, 1.28·√S)` (8 m needs 3.7 s, 4 m needs 2.6 s, 10.5 m needs 4.2 s).
2. Expect the swing to be pivot-driven: attaching while the pivot moves away from the player gives a
   stronger swing, toward the player a weaker one. Avoid required routes whose attach window sits
   where the catch is head-on (player moving straight along the rope relative to the pivot). The
   outcome is continuous there but changes fastest with attach timing.
3. Do not make a required route ride a horizontal mover for more than about 2 s when the path period
   is near the pendulum period of the expected rope (2π√(L/g)); resonance pumps the swing over the
   top.
4. Keep the turn points visible; the page draws ink stop bars at both ends, pencil chevrons toward
   each turn and an ink heading arrow on the anchor that grows with its speed.
5. Use `phase` to stagger movers or to set up deterministic before/after-turn labs.
6. Moving anchors are rope targets only; they never collide (collision stays in level data).

## Not verified

- Only the kinematic adapter was measured; the Planck candidate's moving-anchor behaviour was not.
- Steering input (`steerAccel`) was held at zero; its energy cap is measured against world-frame
  energy at the lock, which a moving pivot changes anyway.
- Feel and readability with real players and on real hardware (doc 13 playtests); the lab level's
  gaps were not tuned for traversal.
