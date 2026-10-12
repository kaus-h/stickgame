# Telemetry phase 1 (GMR-49)

This is **local, opt-in playtest instrumentation**, not production analytics. It reads `SimEvent` and `SimSnapshot` without mutating the simulation. No backend has been selected or connected: selecting one requires an owner account and the consent/operations decisions from canon 33. Phase 1 is for GMR-52 external playtests; no platform analytics calls are added or altered. Existing exit/enemy analytics wiring is unchanged.

## Collection and export

The web adapter `installPlaytest` performs **no work** unless the URL includes exactly `playtest=1`, for example `?level=1-1&playtest=1`. Without that flag it registers no listeners, takes no samples, allocates no recorder and produces no telemetry. Enabling the flag records locally in memory only. The recorder never transmits data, writes storage or sets cookies. `sessionId` is a new random UUID for each installation/page load; there is no account identifier, persistent ID, device identifier, IP collection, fingerprint or cross-session link.

Call `installPlaytest({ levelRef: () => level, onEvents: (listener) => runtime.onEvents(listener), snapshot: () => runtime.sim.snapshot(), window })` from the web composition root. The integration call into `main.ts` is **intentionally not part of this phase-1 bundle**, per the Opus amendment. Call `dispose()` on teardown; it unregisters the event listener and page/keyboard handlers and cancels the frame observation. It also records `quit` if an unfinished run is active. Page hide records `quit` once per unfinished run; a menu-exit handler can call `dispose()` to capture explicit early exits (the adapter receives no menu callback). In-memory data is lost on navigation unless the player exports it first.

While opted in, press **Shift+E** to download `playtest-<levelId>-<timestamp>.json`. The UTF-8 JSON object has `format: 1`, `build` (the same `BUILD_HASH` used by replays), `date` (ISO-8601 export time), an ephemeral `sessionId`, and `events` in chronological insertion order. The oldest events are discarded once the 50,000-event capacity is reached; recording continues. Level changes start a new director while retaining the local recorder so a single export can include several levels. No background upload or consent UI is provided in phase 1.

## Event catalog and design questions

All events have a top-level simulation `tick`, `name`, and typed `props`. World positions and offsets are quantized to **0.1 m**, and velocities to **0.1 m/s**. `levelId` is `level.telemetry.levelId` if authored, otherwise `level.id`. `chamberId` uses the first containing authored region in `level.chambers`, inclusive of boundaries, matching `exitTelemetry`; otherwise it is `none`.

| Event            | Props                                                                                                  | Question it answers                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `attempt_start`  | `levelId`, `life`, `fromCheckpoint`                                                                    | How many lives does a level take?                                                       |
| `death`          | `levelId`, `chamberId`, `cause`, `x`, `y`, `lifeTicks`, `ropeAttached`                                 | Where and why do players die? Death heatmaps and unfair chamber diagnosis.              |
| `rope_attach`    | `levelId`, `chamberId`, `anchorId`, `length`, `impactOffsetX`, `impactOffsetY`, `vx`, `vy`, `grounded` | Which anchors are used, at what rope lengths? Tether heatmaps and length distributions. |
| `rope_release`   | `levelId`, `chamberId`, `anchorId`, `vx`, `vy`, `heldTicks`, `cause` (`player`/`timed`)                | Is release timing learnable? Release-speed spread by chamber.                           |
| `rope_invalid`   | `levelId`, `chamberId`, `reason`, `x`, `y`                                                             | Do invalid shots suggest misleading targets or out-of-range aiming?                     |
| `chamber_enter`  | `levelId`, `chamberId`, `firstThisRun`, `runTicks`                                                     | Which chambers cause drop-off and how much time passes between entries?                 |
| `checkpoint`     | `levelId`, `checkpointId`, `runTicks`, `lifeCount`                                                     | Are checkpoints positioned where players need them?                                     |
| `level_complete` | `levelId`, `runTicks`, `deaths`, `lives`                                                               | Time to first clear and deaths per level (difficulty curve, doc 14 §3a).                |
| `quit`           | `levelId`, `chamberId`, `runTicks`                                                                     | Where do players give up?                                                               |

`attempt_start` is emitted for the first observed life and after simulation resets; the active checkpoint determines `fromCheckpoint`. `death` uses the pre-reset death event, not the respawn position. `level_complete` uses the successful exit event; lives and run deaths are tracked across respawns and reset when a new run starts. The director emits `chamber_enter` only when a sampled position crosses into a new region, including first entries and revisits. Multiple simulation ticks are batched into render frames, so very brief chamber crossings between observations may be missed.

A few fields require care in analysis. `rope_release` velocity comes directly from the exact release event. `rope_attach` uses the attach event's length and the available frame snapshot for position, velocity and ground state. Since the runtime batches events, these _snapshot-derived_ fields may describe the end of the frame rather than the exact attach tick. If an attach and release occur before that snapshot, `impactOffsetX/Y` are `null` unless a matching valid target is still available; missing values are not fabricated. Grounded attachments may pay rope out until takeoff, so `rope_attach.length` is the initial attachment distance, **not necessarily the eventual locked swing radius**. Phase 1 does not add a `rope_lock` event to the specified catalog. The `rope_release.anchorId` and `heldTicks` are computed from the most recently observed attach and can be `unknown`/`0` if the capture started mid-tether.

## Analysis views (no dashboards shipped in phase 1)

- **Death heatmap:** aggregate `death` positions and causes by `levelId`, `chamberId` and build.
- **Tether heatmap and length distribution:** aggregate `rope_attach` anchor IDs, offsets and connection lengths, excluding null offsets from spatial plots.
- **Release-timing study:** `rope_release` held ticks, speed components and cause by chamber.
- **Chamber drop-off:** `chamber_enter.firstThisRun`, `level_complete` and `quit` within an ephemeral session. This is descriptive playtest evidence, not an account-level retention metric.

Only sessions intentionally exported and supplied by the playtester can be analyzed. Backend collection, platform consent UX, sampling policy and hosted dashboards are **deferred**, not silently enabled.
