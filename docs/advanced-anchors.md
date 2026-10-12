# Advanced anchors: timed and one-use (GMR-60, phase 1)

Opus design. The look follows doc 09 H3 (locked).

## Timed anchor

```json
{ "id": "t", "position": [16, 2.5], "timed": { "on": 2.5, "off": 1.5, "phase": 0 } }
```

- **Usable for `on` seconds, then unusable for `off` seconds, repeating.** The schedule is counted in whole simulation ticks from the start of the attempt (`src/sim/anchorTimer.ts`). That makes it exact and frame-rate independent, and it restarts identically on every reset and checkpoint respawn. `phase` (0..1) shifts the cycle at tick 0.
- **While off, it can't be targeted.** A press reports `ropeInvalid: no-anchor`, as for empty space. Selection and the impact point are otherwise unchanged (doc 09 C1).
- **If the on span ends while you're attached, the rope lets go at the end of that tick, so a snapshot never shows an off anchor holding a rope.** The event is `ropeRelease` with `cause: 'timed'`, and the swing velocity is kept, exactly as for a player release (doc 04: releasing keeps the swing's velocity). The rope-length rule is untouched.
- **Content limits** (parser and schema): `on` ≥ 1 s, so there is always room for the warning; `off` ≥ 0.25 s.
- **Telegraph (H3):** the ring is drawn as 8 segments. Over the last half of the on span (at least 0.5 s), paper-coloured arcs rub out the ring itself one segment at a time, clockwise from 12 o'clock. While it's off, the faded ring sits inside a dashed pencil circle and its segments draw back in as it returns.

## One-use anchor

```json
{ "id": "u", "position": [36, 2.5], "oneUse": true }
```

- **Spent once you let go of it**, however the rope ended: a release, a timed release, or a death reset (which restores it anyway). The event is `anchorSpent`. A spent anchor can't be targeted.
- **Comes back on every reset and checkpoint respawn**, so each attempt is identical.
- **Look:** an ink pen crack across the ring. Once spent, the ring is erased and a faint pencil ghost of the crack remains.

## Snapshot and tools

`SimSnapshot.anchorStates[i]` is `{ active, ticksLeft, span, oneUse, spent }` (render-only reads). The debug event log prints timed releases and spent anchors. The state hash is unchanged (`anchorStates` is derived), so existing replays and goldens are unaffected.

## Lab

`?level=lab-anchors` has a slow timed anchor, a one-use anchor, then two phase-shifted timed anchors. Its solver fixture is `content/solutions/lab-anchors.json`: the route uses timed, one-use, then timed, with a tightest window of 7 ticks.

## Not in this phase

Moving-while-attached (an anchor that only moves once you hang on it), face-specific, recovery, and the _inactive_ state. Their looks are reserved in doc 09 H3.
