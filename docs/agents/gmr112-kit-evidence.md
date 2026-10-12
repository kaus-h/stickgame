# GMR-112: terrain kit 0017

Fresh branch from main `9a3c767` (merged GMR-111). Followed the Linear brief and 07B translation/checklist. The two approved source sheets are preserved under `assets/art/kit-0017/source/`; 36 derived 1x assets have individual provenance rows (0017A/0017B, 2026-10-11). The slicing script preserves source images, records crop/guide metadata, removes paper and encodes compact transparent ink. One-way T29–T31 and hazard-family T24/T32/T33 are excluded.

## Rendering and selection

0017 is the default; `?kit=0016` retains the former renderer. Source stamps stay within collision polygons and only exposed edges receive contact contours. Shared/boundary mass retains GMR-111 connectivity; hatch opacity is 70%. Primary contact contours follow the authored geometry; source guides calibrate their inward stamps. No collider, level data, simulation, input, replay golden or budget change.

| Pieces   | Where selected                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| T01, T07 | Cropped interior infill and concave stratum, without source rectangle borders                                    |
| T02, T03 | Stable top-edge variants                                                                                         |
| T04–T06  | Exposed underside and left/right faces                                                                           |
| T08–T15  | Convex/concave union corners in all eight orientations                                                           |
| T16–T18  | Narrow vertical wall strip and attached wall caps                                                                |
| T19, T20 | Actual wall-attached ledge junctions                                                                             |
| T21–T23  | Long ceiling undersides and connected wall/ceiling joins                                                         |
| T25, T26 | Short exposed ledge terminals                                                                                    |
| T27, T28 | Thin closed bridges and small isolated solids                                                                    |
| T34–T39  | Meniscus, geometry-selected bank/corner joins and depth; sheet-B stone removed, sheet-A terrain remains the bank |
| T40–T42  | Three faint horizontal scenery layers at 0.08/0.16/0.28 parallax; reduced motion freezes phase                   |

Capture manifests list actual selected parts. Section 1 uses T01–T06 (including the T03 variant in 1-3), T08–T11, T16/T17/T21/T27 and T34–T42. Other shape families are available to matching authored geometry; synthetic topology fixtures exercise concavity, reversed winding, contact suppression, caps/bridge/island selection and pool banks. No new terrain was authored to manufacture an asset showcase.

Static terrain remains baked into the existing world tiles. Background Canvas allocations are bounded by viewport strip sizes under overview zoom; stationary camera frames reuse them. The three shared and private scenery textures are removed on shutdown. Debug output reports selected kit, layer count and combined Canvas storage. Ten theme reloads check exact texture/camera stability.

## Visual evidence

`docs/art/evidence/gmr-kit0017/` contains before/after play and overview screenshots for 1-1, 1-2 and 1-3, plus a collision-overlay view for 1-2. The before views use the 0016 compatibility path from merged GMR-111; after views use 0017. All captures use Chromium at 1600×900. The manifest records actual IDs, parts, textures, cameras and fingerprints.

Fingerprints match between kits: 1-1 `2857100c`, 1-2 `52e221e9`, 1-3 `a19dc448`. Three-browser physics and replay drift checks preserve `718c6968` / `7e2af593`. Source/style changes do not alter replay goldens.

The new unit checks prevent blank output PNGs, missing runtime datum guides and a painter that silently omits stamps. Pixel probes require primary landing contact within one screen pixel at native play zoom, continuous red meniscus without a paper seam, no extra depth contact stripe, retained T-junction mass and ceiling drips. Compatibility style probes retain 0016's seven-metre pool repeat. The review revision below supersedes the initial 0017 depth treatment: its complete hazard polygon now reads as red mass.

An independent Luna review found no remaining geometry, pool, camera or lifecycle blocker. Physical-device/GPU and owner art acceptance remain pending; full local E2E coverage is not claimed.

## Initial integration verification

- `npm run check`: passed; 66 unit files, 512 passed / 3 expected failures.
- Fresh-server renderer suite on Chromium, Firefox and WebKit: 40 passed / 2 expected HMR skips, port 5195, two workers. No increased timeout or retry count. The earlier development Firefox compatibility boot stalled once; a subsequent attempt was interrupted by an active source reload. The complete frozen-source run passes.
- Additional scoped physics, replay, checkpoint/race and body checks: 25 passed / 1 expected WebKit performance skip. These accompanied the earlier renderer run; the renderer cases were subsequently rerun in full above.
- `npm run bundle:report`: 261.8/270 KB initial JavaScript gzip; 1089.5/1090 KB total distribution. Both existing budgets pass unchanged.
- Source-sheet SHA-256 comparisons: both committed copies match the supplied originals.
- Temporary capture script and port-specific Playwright config removed before commit.

## Opus review revision

Merged main `4cca463` into this branch with both sides preserved: GMR-56's fixed-size upright exit door, wordless exit marks, reach fade and reticle colors; GMR-69's heads/animation; level 2-1 and the subsequent main anchor work. No changes to these incoming mechanics. The conflicts retained every asset provenance row and combined exit debug text with kit/scenery diagnostics.

Doc 09 H4 now requires the entire lethal floor to be red-pen mass. The glyph depth band is replaced by a clipped red body with irregular, native-height tonal pen strokes beneath the source meniscus/bank joins. Terrain surface classification excludes spike overlays, preserving a continuous supporting crest; pools and real solid contacts retain their boundary rules. The new unit regression failed before this fix, and the real-Phaser pixel test checks ink in over 95% of columns beneath the start spike strip. Pool pixels require over 90% red interior and under 5% pale interior.

Integrating main pushed the distribution to 1112.1 KB against the unchanged 1090 KB limit. Runtime WebP encoding recovers 24,255 bytes: all 0017 visible RGB/alpha remain exact; the two 0016 compatibility textures retain every alpha byte and dimension with bounded RGB palette rounding (paper-composited channel maximum 4 ledge / 8 pool). The reproducible encoder verifies all 38 files. Every original PNG remains unchanged and runtime assets have provenance rows.

The updated 1-2 and 1-3 play shots and their capture metadata show the reviewed revision, including main's hero and reach cues. Other screenshots retain the initial integration for comparison. Physical-device/GPU proof and final owner art approval remain pending.

Review validation: `npm run check` passes (69 files, 528 passed / 3 expected failures). The three-browser renderer/physics/replay run passed 50 cases with 4 expected skips (including the temporary screenshot case); after the final native-stroke refinement, all three browsers passed the targeted pool/spike cases and Chromium re-capture (10 passed / 2 expected capture skips). Replay hashes remain `718c6968` / `7e2af593`. Final bundle is 265.4/270 KB initial gzip and 1088.2/1090 KB total; no budget change. A parallel full-check/browser attempt hit startup timeouts with no missing resources or page errors; serialized verification passes without raising timeouts or retries. Temporary capture test and port config were removed.
