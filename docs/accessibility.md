# Accessibility (GMR-50)

Every option lives in **Settings** (title screen or pause menu) and is saved locally. Targeting
uses one shared simulation: each selected anchor attaches at its centre in every input mode
and assist tier. Settings adjust presentation, controls and tolerance; rope length and release
momentum follow the shared rules in [targeting.md](targeting.md).

| Option                                   | What it does                                                                                                                                                 | Where                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Keyboard controls                        | Rebind every desktop action. Escape always pauses. Tab stays focus navigation. The mouse button always ropes.                                                | `src/input/bindings.ts`, `src/app/web/ui/ControlsPanel.ts` |
| Volume (master, effects, music) and mute | Separate audio buses.                                                                                                                                        | `AudioEngine`                                              |
| Reduced motion                           | System, on or off. Calm camera (no lookahead), no parallax, short death scribble, fade instead of the eraser sweep.                                          | `docs/camera.md`, `docs/death-bodies.md`                   |
| High contrast                            | Pencil marks darken from `#8a8a8a` to `#4a4a52`. Out-of-reach anchors fade to 60% instead of 40%. The rope dash is thicker. Faint background scenery is off. | `GameScene` (`PENCIL_HC`, `OUT_OF_REACH_ALPHA_HC`)         |
| Larger aim reticle                       | The aim reticle and impact cross draw 1.6× larger, with thicker lines.                                                                                       | `GameScene` (`LARGE_RETICLE`)                              |
| Aim assist                               | Standard, wide select or snap. Every tier uses centre attachment and the shared target highlight.                                                            | `docs/targeting.md`                                        |
| Mobile Rope                              | Button (default) or tap. The button presses at the current neutral target or last tap; tap aims and presses together within radius + 1.8 m.                  | `docs/mobile-controls.md`                                  |

High contrast keeps the locked visual language: red is still lethal only, the highlighter still marks the targeted anchor, and out-of-reach anchors stay visibly dimmer than reachable ones. Mouse, gamepad and touch use the same highlight without an extra release cue. Toggling high contrast rebuilds the scene, as a level change does. The reticle size applies at once.

## Flash reduction

There is nothing to reduce. The game has no full-screen flashes, no strobing and no rapid luminance changes:

- **Death:** a pen scribble over the spot, plus the bodies layer.
- **Exit:** an eraser sweep (a fade under reduced motion).
- **Splits:** text under the level title.

Keep it that way. Any new effect that changes the luminance of a large area faster than 3 times a second needs a reduced-motion or flash-safe path, and an entry in this table.

Evidence: `docs/art/evidence/gmr50/`, level 2-1, default versus high contrast with the larger reticle.
