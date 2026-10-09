# 0016 collision-aligned level art (GMR-107)

The owner approved the layered black pen look of 0014/0015 with thinner strokes, supplied as `assets/sheets/0016-level-kit-thin.png` (Decision Register 12, 2026-10-09). This change applies that approved sheet to authored collision, keeping the hero, simulation, physics and geometry untouched. Red in the kit is confined to lethal spikes and ink. The ring remains the clearest interactable, with the existing highlighter/impact marker and moving-pivot guide.

## Constraints, open choices and acceptance

Locked: collision first; render-only state; unchanged simulation/replay/device-lab hashes; no hero renderer changes; no reference-art copying; red danger semantics; budgets pass. The bounded choices here are crop guides, repeat size, shaded skirt depth and the placeholder scenery strength. They do not lock new gameplay or art canon.

Acceptance/evidence: all three authored Section 1 levels use kit art; normal-view collision crests stay within 2 screen pixels and whole-level `?overview=1` views expose the same geometry; hazards/anchors read in play; theme changes preserve canonical fingerprints; scene reloads release their textures; `npm run check`, solver verification and the existing bundle budgets pass. Before/after overview and normal-play screenshots are committed under `docs/art/evidence/gmr107` and linked in the PR. Human/native visual acceptance remains owner review.

## Repeatable slicing

```sh
node scripts/art/slice-sheet.mjs assets/sheets/0016-level-kit-thin.png assets/art/kit-0016 --spec assets/sheets/0016-level-kit-thin.spec.json --white-paper-alpha --1x-only
```

The source has an opaque white matte. Explicit sheet-pixel rectangles avoid treating the page as one alpha component. White matte removal reconstructs alpha without a white halo, then area-averaged downscaling preserves fine marks. Non-hazard crops have stray red converted to black in this white-paper mode; the original transparent-sheet mode keeps its existing colours. Only spike/pool specs opt into red. Fourteen 1x slices have individual provenance rows; the complete set is 97,184 bytes. Only eight needed slices are imported by the game. No 2x set or original sheet ships in the bundle.

`manifest.json` records source rectangles, two-pixel padding, actual rounded output dimensions and explicit collision guides. Guide conversion uses those actual dimensions, not an assumed scale; padding and rounding therefore cannot shift a ledge crest or ring centre.

## Mapping and lifetime

`src/render/kit/LevelKit.ts` decodes browser images once at initial boot, without adding the omitted Phaser Loader. Restarts, retries, scene changes and authoring reloads reuse them. Only initial asset decode waits; there is no new work or delay between death and retry.

Ledge crests tile at native 64 px/m. The last repeat crops to the exact remaining length. Left/right skirt caps align their calibrated source ends to the rectangle ends; hatch skirts clip to the collision polygon and fade into paper. Side/underside edge strips use the ceiling crop, calibrated to its underside guide at source y=695; a thin contour at the authoritative polygon keeps the exact boundary readable without stretching the kit strokes. Light top foliage is cosmetic, not extra collision. This mapping also follows sloped polygon edges in the labs.

Lethal regions clip all red ink to their collision polygons. The pool's central pen strokes repeat without cliff-end decorations; spikes sit on the exposed top, hang down from ceiling hazards, or face left on vertical hazard faces. A red contour shows the complete lethal boundary even between illustrated teeth. The doorway hut uses its opening guide at the authored entry side; the existing angle/speed/alignment marks stay in front and preserve the full compartment rules.

Each anchor image is positioned at the interpolated pivot centre and its measured outer ring radius is scaled to the authored impact radius. The mounting tab is decoration above the disc. The active-target highlighter, cross and moving arrow remain separate presentation effects.

Static terrain art bakes into world canvas tiles up to 1024 pixels, culling empty tiles and cropping the last row/column to the actual extent. The debug overlay reports theme, allocated tile count and canvas pixel storage. Only a few quads are visible per frame. Sparse moving-pivot/exit guides remain a lightweight Graphics layer; they do not allocate a second full-world texture set. Scene shutdown removes each tile texture; the single shared ring texture is reused. Camera routing and the body layer keep their existing ownership. Device-lab boot does not load this kit.

## Level themes

```json
{ "version": 2, "theme": "paper" }
```

`paper` is the default and omits background clouds/birds. `scenery` uses the existing faint pencil doodles as a clearly provisional substitute for the separate background sheet requested in GMR-107. Both use the same ruled paper and gameplay art. No scenery sheet is invented or promoted to approved here.

Theme is validated authoring metadata, retained during migration and stored in a content-owned `WeakMap` keyed by the compiled level. It never becomes an enumerable simulation field, so `levelFingerprint`, PB compatibility and deterministic replay state remain identical. The registry retains this level identity. Authoring HMR compares theme as well as canonical geometry, then uses its existing reset-to-spawn/redraw path. Weak keys allow discarded levels to be collected.

## Verification limits

Screenshots use Chromium at 1600×900, canvas rendering, default zoom or `?overview=1`. The baseline is the authored pre-kit 1-1/1-2/1-3 renderer from GMR-59 commit 891abc8; the implementation branch follows main including merged #48/#49. Geometry is identical. Timers can differ by a frame; these are visual art comparisons, not replay-frame goldens. Capture code asserts the actual level ID, so 1-3 is never the old placeholder lab.

Physical-device pixel density, subjective foliage/readability and the future scenery background sheet are not validated by desktop screenshots. The small 1x set intentionally trades deep zoom resolution for the existing budget; gameplay uses the fixed default camera scale. Hero artwork and its line weight are outside this issue.
