# Style bible: "drawn on a notebook page" (GMR-40)

Derived from canon docs 07 and 07A (Parts 2A/2B/2C) and the owner's art direction. On 2026-10-07 the owner gave three directions:

- "too goth core… higher emphasis on this entire game to feel like it's been drawn on paper"
- "keep it all black ink for primary outlines; blue/purple ink should be rarer"
- deadanddetached as the largest inspiration, translated and never copied

This bible is the reference for every prompt, procedural renderer and asset review.

## 1. The page

- **Paper.** Warm off-white `#F3EFE6`. College-ruled blue lines `#9EC2DF` every 0.5 world metres. The lines are world-anchored, so they double as a height ruler.
- **Margin and holes.** A red margin line `#E28A8A` and punched holes on the left edge. Binding is only seen on menu and level-select spreads.
- **The page is the world.** Nothing sits "on top" of the paper except the HUD tally marks and handwriting, which are also drawn as if on the page.

## 2. Ink rules

| Ink                | Colour           | Use                                                                                      | Never                         |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| Black pen          | `#16161A`        | All primary outlines, the hero, hatching, rope (dashed), text                            | —                             |
| Pencil grey        | `#8A8A8A`        | Guides only: moving-anchor tracks, last-rope trace, aim reticle when nothing is targeted | Solids, the hero              |
| Red ballpoint      | `#C5302A`        | **Danger only**: hazards (hatched inside black outlines), death cross, invalid shot      | Decoration                    |
| Yellow highlighter | `#FFE14A` @ 55 % | **Interactable now**: the anchor you are on or will connect to                           | Decoration                    |
| Blue / purple ink  | rare             | Margin notes, collectibles, special story moments, at most one element per screen        | Gameplay-critical information |

**Colour is never the only channel** (doc 08). Hazards also have teeth or spikes in their silhouette, and the targeted anchor also gets an impact cross.

## 3. Line and mass

- **Line weight (owner, 2026-10-09).** Terrain preserves thin 0016 source strokes at native 64 px/m, with a bold grassy contact crest and dense hanging hatch that fades into open paper. Platforms have no closed box or lower outline; thin doubled side trails fade from their top corners. The kit preserves the source pen wobble. Other procedural outlines use stable per-object wobble (`render/ink.ts`), so none shimmer frame to frame.
- **Black-mass ratio.** The page stays mostly paper-white. Fills are hatching, not flat black. The only flat black is boots, eye holes, small bolts and the hero's mouth stitches.
- **Hatching.** Shading uses directional cross-hatching:
  - solids: diagonal down-right
  - hazards: crossed red scribble
  - shadow side of round forms: tight short strokes
- **Negative space** separates gameplay layers. Background doodles never touch collision outlines.

## 4. Who draws what

| Element                                                 | Source                                                                      | Why                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Level geometry (solids, hazards, walls)                 | **0016 thin-line kit** cropped/tiled to collision (`render/kit/LevelKit`)   | Collision stays authoritative; calibrated crests and clipped skirts preserve its boundary |
| Rope                                                    | Procedural dashed line                                                      | Locked canon: dashed                                                                      |
| Anchors                                                 | 0016 ring slice calibrated to the authored impact radius                    | The art must equal the impact disc                                                        |
| Hero                                                    | AI design reference (0007) leads to a procedural or cutout rig drawn in ink | Consistency across 10 poses; animation stays code-driven                                  |
| Enemies, boss, props, margin doodles, menus, title page | AI image generation, then cleanup, threshold, slicing                       | Expressive illustration where hand-drawn charm matters most                               |

**Historical decision (2026-10-07).** Sheet 0005 v1/v2 terrain tiles were dropped. **Superseded for terrain rendering by the owner-approved 0016 thin-line kit (2026-10-09, GMR-107); 0005 remains unused.** Even with explicit "pure ink" prompts they drift back to grey dungeon stone, which reads goth, not paper.

## 5. The hero (reference: `assets/concepts/0007-hero-pose-sheet.png`, owner-approved 2026-10-08; supersedes 0006, which had a scarf)

- **Head.** Round, slightly lumpy skull drawn in one wobbly line. Two eye holes and a short stitched mouth (3–4 cross-stitches). The tearless eyes are the signature mark from 07A 2C.
- **Body.** Single-line neck and limbs, tiny round hands, small solid-black boots.
- **No scarf, cape or accessories** (owner, 2026-10-07). Motion reads from the pose and a few short speed strokes behind the body.
- **Heads.** The drawn heads from `assets/concepts/0008-hero-parts-sheet.png` are approved for use as the in-game head sprites (owner, 2026-10-08). Limbs and body stay procedural.
- **Silhouette test.** The hero must read at 40 px tall on a phone.
- **Open question for owner review.** Hollow outlined eyes or solid black ovals? 0006 drew solid ovals, which read better at small size.

## 6. Guardrails (07A Part 2B, mandatory)

- Never name deadanddetached or any living artist in a prompt. Never upload their images. Only our own approved sheets may be used as reference images.
- Never copy identity marks, compositions or characters from any reference. Translate qualities: line confidence, hatching density, morbid-cute tone.
- No gallows, nooses or hanging imagery (doc 07 §14). The rope is a dashed line, never a noose.
- Every asset gets a row in `assets/provenance.csv`, and every prompt is filed in `prompts/` verbatim.

## 7. Pipeline

1. **Prompt.** Use `prompts/<id>-<name>.md`. Ask for pure black ink on white, no grey, no text, square, high resolution.
2. **Download** to `assets/concepts` or `assets/sheets`, and add a provenance row.
3. **Clean.** Threshold to pure ink with `scripts/art/slice-sheet.mjs`: alpha from luminance, then slice by spec JSON.
4. **Review** in `art-preview.html` on the notebook page at gameplay scale, desktop and phone.
5. **Accept** only after the owner art review at the Vertical Slice gate (doc 21).

## 8. Readability checklist (every screen)

- [ ] Hazards: red ballpoint plus a toothed silhouette.
- [ ] Interactable anchor: highlighter plus impact cross.
- [ ] The hero is visible against every background (no doodles behind the hero's path).
- [ ] At most one blue or purple element.
- [ ] Ruled lines stay faint enough that a 1-line-wide platform still reads as solid.
