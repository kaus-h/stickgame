# Replay payload and repeatability (GMR-29)

A replay is the inputs of a run, never its states. Replaying them through the same build reproduces
the run tick for tick.

## Payload (`src/core/replay.ts`)

```ts
{ version: 1, build: string, level: string, seed: number, ticks: number,
  inputs: { tick: number; intents: Intent[] }[] }   // ascending tick, empty ticks omitted
```

`encodeReplay` writes compact JSON with short keys and intent codes (`["m",axis]`, `["a",x,y]`,
`"j"`, `"J"`, `"r"`, `"R"`, `"x"`, `"p"`). Doubles round-trip exactly through JSON. `decodeReplay`
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

Final hashes: main `0c1a8f16`, moving anchor `1f5b90d7`. Not yet measured: native iOS/Android
WebViews, other CPU architectures (Apple silicon vs x86), and long runs (minutes).

## Recommendation for GMR-35 ghosts

Use input replay (this payload), not transform recording. It is a few hundred bytes per run, always
consistent with the simulation, and showed zero drift in every measured condition. Adopt a drift
tolerance of exactly zero for same-build replays: any hash mismatch in the per-second hashes is a
bug, not noise. For cross-build ghosts, show them as approximate and, if exact playback matters,
store a transform track alongside as a fallback. Keep `npm run test:e2e` replay-drift in CI so a
backend or engine change that breaks determinism fails loudly.
