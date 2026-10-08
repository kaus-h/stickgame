# Replay payload and repeatability (GMR-29)

A replay is the inputs of a run, never its states. Replaying them through the same build reproduces
the run tick for tick.

## Payload (`src/core/replay.ts`)

```ts
{ version: 1, build: string, level: string, seed: number, ticks: number,
  inputs: { tick: number; intents: Intent[] }[] }   // ascending tick, empty ticks omitted
```

`encodeReplay` writes compact JSON with short keys and intent codes (`["m",axis]`, `["a",x,y]`,
`"j"`, `"J"`, `"r"`, `"R"`, `"x"`, `"k"` respawn, `"p"`, `"g"` ghost toggle; the last two never
reach the simulation). Doubles round-trip exactly through JSON. `decodeReplay`
validates everything and throws `ReplayError` with a `path` (for example `inputs[3].intents[0].axis`).
`RecordingIntentSource` wraps any `IntentSource` and records non-empty ticks; `ReplayIntentSource`
plays one back. Poll ticks are the simulation tick before the step, the same as `GameRuntime`.

## Build mismatch policy

`decodeReplay` returns `{ replay, buildMatches }` and never decides. Policy
(`BUILD_MISMATCH_POLICY`):

- Leaderboards and anything competitive: refuse a replay whose build differs.
- Casual ghosts: allow it, labelled "approximate", because another build may simulate differently.

## State hash

`hashSnapshot` (`src/sim/hash.ts`) is a 32-bit FNV-1a over exact float64 bits of tick counters,
mode, facing, player position and velocity, rope fields and all anchor positions. Aim and target are
not hashed.

## Measured repeatability

Scenarios on `lab-01` (`src/tools/replay-drift/scenario.ts`, recorded by a reactive scripted player):
the main run (run, jump, airborne tether to `a-first` at 13.5,2, swing, release, death, restart, 600
ticks) and a moving-anchor run (spawn moved onto pillar-3, tether to `a-moving`, 600 ticks).
Every comparison is per-tick hash equality, 601 hashes per run.

| Condition                                               | Result                  |
| ------------------------------------------------------- | ----------------------- |
| Direct stepping vs GameRuntime at 30, 60, 144 Hz        | bit-identical           |
| GameRuntime and frame clock under seeded jittery deltas | bit-identical (4 seeds) |
| 20 repeated runs, fresh world each                      | bit-identical           |
| Encode, decode, replay                                  | bit-identical           |
| Node vs Chromium, Firefox, WebKit (e2e)                 | bit-identical           |

Final hashes at da84320 (before the rope-lock review fixes; they change by design whenever sim rules change): main `0c1a8f16`, moving anchor `1f5b90d7`. Not yet measured: native iOS/Android
WebViews, other CPU architectures (Apple silicon vs x86), and long runs (minutes).

## Recommendation for GMR-35 ghosts

Use input replay (this payload), not transform recording. It is a few hundred bytes per run, always
consistent with the simulation, and showed zero drift in every measured condition. Adopt a drift
tolerance of exactly zero for same-build replays: any hash mismatch in the per-second hashes is a
bug, not noise. For cross-build ghosts, show them as approximate and, if exact playback matters,
store a transform track alongside as a fallback. Keep `npm run test:e2e` replay-drift in CI so a
backend or engine change that breaks determinism fails loudly.

## PB ghost (GMR-103)

The personal best of each level is saved (`SaveData.pbs`, save version 2) as its run time, its
checkpoint splits, the encoded replay and a fingerprint of the level definition. A run replay starts
at the last full restart: tick 0 holds `Simulation.carryIntents()` (held direction, facing, jump
held, aim), a `restart`, then that tick's own intents, so a fresh simulation plays the run exactly.
`RunTiming` (`src/app/runtime/RunTiming.ts`) feeds the PB replay to a second, headless simulation in
lockstep with the run clock; it is drawn as the hero in pencil grey at 35% alpha.

Unlike the casual-ghost policy above, the PB ghost is never shown approximate: a PB whose level
fingerprint or build does not match, or whose replay does not decode, is discarded on load
(`validatePb`) and the next clear records a new PB. Bare version-1 `ghosts` are dropped by the
version 1 to 2 save migration for the same reason.
