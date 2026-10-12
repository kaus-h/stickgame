# Music (GMR-42, phase 2)

Opus decision: code-generated adaptive music on raw WebAudio. There is no library and no recorded audio (doc 09 I2, K7). The research and comparison are in the Linear doc "GMR-42 Music direction research".

## Direction

"Torn-page pulse" that thins out to "pencil ghosts".

| Bank        | Key                                                   | Progression (8 bars)                   | Motif (3 notes) |
| ----------- | ----------------------------------------------------- | -------------------------------------- | --------------- |
| `section-1` | D Dorian                                              | Dm9 Dm9 G6/D Em7 · Dm9 Fmaj7 G6 Am7    | A C D           |
| `section-2` | G Aeolian (raised 7th in the D chord for the cadence) | Gm9 Gm9 Ebmaj7 Ebmaj7 · Cm9 Cm9 Dsus D | G Bb D          |

The tempo is 100 BPM in 4/4.

## Layers

| Layer   | Voices                                                                                                     | Driven by                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| base    | Dusty keys (triangle plus a soft octave, low-passed) and a muted plucked bass (saw with a filter envelope) | Always on. The motif closes each 4-bar phrase, quietly. There is no lead melody over gameplay.                                      |
| pulse   | Dry pen clicks in 8ths (band-passed noise), with seeded ghost notes                                        | **Player movement energy:** it swells while running or swinging and fades to pencil ghosts while the player stands still and plans. |
| tension | A sparse high tremolo drone (two detuned saws), with a ♭2 rub every 8 bars                                 | Rises through the level's chambers. A death dips it for 1.6 s and nothing else.                                                     |
| sting   | The section motif, an octave up                                                                            | Reaching a new chamber for the first time in the run, and the exit.                                                                 |

## Retry safety (the contract)

- **One transport for the app's lifetime** (`src/audio/music/transport.ts`). It starts on the first audio unlock and is never restarted by deaths, retries, respawns or level changes. Section banks swap at a bar line.
- **A death changes one gain target** (tension), ramped on the audio clock. The phase, bar and beat never jump.
- **Lookahead scheduling:** a 25 ms timer schedules notes 150 ms ahead at absolute AudioContext times. After a stall (a hidden tab) it skips to the next bar line on the original grid and never replays the backlog.
- **Audio never feeds the sim.** `MusicDirector` reads snapshots and events and only outputs gain targets and stings. The score uses its own integer hash, never the sim RNG.
- Mute and the music volume act on the music bus.

## Measured (offline render of 12 s of section 1 at full intensity in Chrome)

- Peak −10 dBFS, RMS −26.5 dBFS at the default master 0.8 and music 0.6. No clipping.
- Energy: about 26% bass, 62% low-mid, 11% mid, under 1% presence. The music is deliberately warm and low, leaving the presence band to the attach, release and death sounds (doc 08: timing cues stay audible).
- Bundle: 0 KB of libraries. The music code is a few KB.

## Not verified yet

- A human listen and the full §6 listening protocol (25 deaths in about 60 s, a 10-minute fatigue check, SFX masking by ear). This needs the owner's ears.
- Mobile audio interruption, and the iOS WKWebView.
