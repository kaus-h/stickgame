# GMR-56 evidence: anchor, hazard and exit visual language

Captured at 1600×900 with the canvas renderer from the branch's dev server. `1-1-exit`, `1-2-exit` and `shaft-fast-streaks` come from temporary copies of the levels (spawn moved next to the exit, or a speed window added to the shaft lab). Those copies were not committed.

| File                           | Shows                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1-1-exit.jpg`                 | Wide exit: door, mouth bracket, inward arrow, ±60° pencil cone                                                                                                                          |
| `1-2-exit.jpg`                 | Slot: tight bracket, ±12° cone, no speed streaks (max 8 m/s = run speed)                                                                                                                |
| `slot.jpg`, `wide.jpg`         | The exit labs, with no in-world text                                                                                                                                                    |
| `shaft.jpg`                    | Shaft lab overview: upright door on the floor, the bracket across the 12 m mouth, down arrow and ±25° cone. Before this change, the door was scaled to the mouth and covered the screen |
| `shaft-fast-streaks.jpg`       | The same shaft with a 20–28 m/s window: three speed streaks behind the arrow                                                                                                            |
| `1-2-play.jpg`, `1-3-play.jpg` | Play scale: red is lethal only; out-of-reach rings are faded                                                                                                                            |

## Blind readability test (GPT-6 High, 2026-10-11)

Six screenshots were given with no explanation of the cues. The file names were visible, and the tester was told to ignore them.

- **Hazards:** 6/6 correct (red spikes, fangs and pool read as lethal).
- **Anchors:** the 2/2 rings present were found. The reach fade can't be judged with one ring per image, because it is a comparative, in-play cue.
- **Exits:** 4/4 found, each with the correct entry side and approach angle. The tester cited the arrow and the cone.
- **Speed:** 0/1. The first version's single chevron read as fletching, so it was replaced by comic speed streaks: 3 streaks = come in fast, 1 = faster than a run, none = run speed. The re-test is still owed.
- **Most confusing, per the tester:** doorway versus decoration, and speed.

### Re-test after the revisions (fresh chat, neutral file names and titles)

Changes: speed streaks replace the chevron, gate dots replace the bracket ticks, and the invalid-shot reticle and exit-miss mark are no longer red.

- **Entry side:** 3/3. **Angle:** 3/3 (±15° estimated for ±12°, ±20° for ±25°, "broad" for ±60°).
- **Gate dots:** read as "mark the opening", as intended.
- **Speed:** three streaks read as "possibly fast" (partial). Exits with no speed mark read as "no indicator", which is the intended meaning. Speed stays the weakest cue. It is learnable in play, and the miss text ("Too fast / Too slow") backs it up.
