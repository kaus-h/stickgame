# Camera and world-space targeting (GMR-25)

## Outcome: hybrid follow camera (CURRENT DEFAULT)

`src/render/camera.ts` holds the pure camera maths. `GameScene` applies it.

- **Follow with lookahead.** The camera centre is the player plus horizontal velocity × 0.35 s (capped at ±3 m), plus vertical velocity × 0.12 s (clamped to -1.5..2 m), with a 1 m upward bias. Ropes mostly go up.
- **Ease.** The camera eases at rate 6/s and snaps on reset or the first frame, so there is no camera travel after a death.
- **No dynamic zoom.** Zoom depends only on the viewport size. It shows at least 12 m of height and at least 23 m of width, whichever needs more zoom-out. 23 m = 2 × (rope max 11 m + anchor radius 0.4 m), so every anchor within rope range ahead or behind is on screen even while standing still, on every landscape aspect from 4:3 to 32:9. Ultrawide screens see more, but never less than the reachable range.
- **Bounds.** The camera stays inside the level bounds.

## What the player sees is what they aim at

- The pointer is a screen position. It is re-projected through the camera of the last rendered frame on every simulation tick (`DesktopInputMapper.beforeTick`).
- So the world point under the cursor is exactly what the player saw when the press was sampled.
- The press itself resolves on the next simulation tick.

## Evidence

| Check                                                                                                                                                           | Result                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Screen→world→screen round trip at 4:3, 16:9, 19.5:9, 21:9 and 32:9, at corners, 4 px edge insets and centre, while the camera moves (Chromium, Firefox, WebKit) | ≤ 2.3e-5 px (float32 camera matrices)                         |
| Pointer tracking anchor `a-first` by its rendered position while running (camera moving), 40 samples per browser                                                | max world aim error 0.023 m; anchor selected in 40/40 samples |
| Every anchor within full rope range visible at 7 viewport aspects (unit test)                                                                                   | pass                                                          |

The 0.023 m error is one frame of camera motion. It is well inside the 1.1 m selection margin and below the 0.4 m impact radius, so camera movement does not create unfair target displacement.

## Level authoring rules derived from this

- A required anchor can be at most 11 m away horizontally; it will be on screen.
- **Vertically, about 7.4 m above the player is visible** (half of 12.9 m at 16:9, plus the 1 m bias). Do not require a shot at an anchor more than 7 m above the take-off point unless the level frames it, for example with a rising route.
- Do not put a required anchor within 1 m of the level bounds edge on the side the camera clamps.
- Dynamic zoom during precision targeting stays out unless a canon decision justifies it.
