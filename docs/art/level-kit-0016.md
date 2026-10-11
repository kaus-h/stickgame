# 0016 collision-aligned level art (GMR-107)

GMR-112 makes [kit 0017](kit-0017.md) the default terrain/scenery kit. This mapping remains the compatibility renderer selected with `?kit=0016`, and still supplies the spike, anchor and exit artwork to both kits.

The owner approved the layered black pen look of 0014/0015 with thinner strokes, supplied as `assets/sheets/0016-level-kit-thin.png` (Decision Register 12, 2026-10-09). This change applies that approved sheet to authored collision, keeping the hero, simulation, physics and geometry untouched. Red in the kit is confined to lethal spikes and ink. The ring remains the clearest interactable, with the existing highlighter/impact marker and moving-pivot guide.

## Constraints, open choices and acceptance

Locked: collision first; render-only state; unchanged simulation/replay/device-lab hashes; no hero renderer changes; no reference-art copying; red danger semantics; budgets pass. The bounded choices here are crop guides, repeat size, shaded skirt depth and the placeholder scenery strength. They do not lock new gameplay or art canon.

Acceptance/evidence: all three authored Section 1 levels use kit art; normal-view collision crests stay within 2 screen pixels and whole-level `?overview=1` views expose the same geometry; hazards/anchors read in play; theme changes preserve canonical fingerprints; scene reloads release their textures; `npm run check`, solver verification and the existing bundle budgets pass. Before/after overview and normal-play screenshots are committed under `docs/art/evidence/gmr107` and linked in the PR. Human/native visual acceptance remains owner review.

## Repeatable slicing

```sh
node scripts/art/slice-sheet.mjs assets/sheets/0016-level-kit-thin.png assets/art/kit-0016 --spec assets/sheets/0016-level-kit-thin.spec.json --white-paper-alpha --1x-only
```

The source has an opaque white matte. Explicit sheet-pixel rectangles avoid treating the page as one alpha component. White matte removal reconstructs alpha without a white halo, then area-averaged downscaling preserves fine marks. Non-hazard crops have stray red converted to black in this white-paper mode; the original transparent-sheet mode keeps its existing colours. Only spike/pool specs opt into red. Fourteen 1x slices have individual provenance rows; the complete set is 97,184 bytes. Only five needed slices are imported by the game; loose fading side contours replace the old cap/ceiling images in response to owner review. No 2x set or original sheet ships in the bundle.

`manifest.json` records source rectangles, two-pixel padding, actual rounded output dimensions and explicit collision guides. Guide conversion uses those actual dimensions, not an assumed scale; padding and rounding therefore cannot shift a ledge crest or ring centre.

## Mapping and lifetime

`src/render/kit/LevelKit.ts` decodes browser images once at initial boot, without adding the omitted Phaser Loader. Restarts, retries, scene changes and authoring reloads reuse them. Only initial asset decode waits; there is no new work or delay between death and retry.

GMR-111 classifies and splits each polygon boundary into exposed top/bottom/left/right/slope intervals or contact with bounds, solids and hazards. A single world-anchored, subtly irregular hatch field fills the union of connected solids and continues beyond left/right/floor bounds; top-bound columns continue upward. Contact intervals receive no contour, including partial T joins. Exposed edges retain two thin ink strokes, with explicit joined convex/concave corner turns. Kit foliage is calibrated to exposed walkable tops only, excluding ceilings and hazard-contact spans.

Connected floors and wall/ceiling masses do not fade to paper at their base. The feathered kit skirt and 0.28 m end feather remain on isolated platforms; their full-solid underside is a thin doubled boundary under 07B, while the interior keeps open paper. Exposed ceiling bottoms have short pen drips. This supersedes the older blanket skirt treatment and open-bottom solid silhouette in the GMR-107 pass. Thin stroke variation and paper gaps keep dense mass distinct from a filled rectangle. No one-way physics is added.
Lethal regions clip all red ink to their collision polygons. Ink pools use the full scribbled height, including ragged surface droplets and paper gaps, excluding the black banks. They repeat in alternating mirrored 7 m stamps, so adjoining tiles sample the same ragged ink edge. Collision clipping trims the final partial stamp. There is no filled rect, narrow-row repetition or red perimeter box. Spikes use five source teeth per 2.5 m and scale vertically to the hazard rect's complete depth; there is no pool backfill between teeth. Floor, ceiling and vertical-face orientations follow the authored hazard. The doorway hut uses its opening guide at the authored entry side; existing angle/speed/alignment marks stay in front and preserve the full compartment rules.
Each anchor image is positioned at the interpolated pivot centre and its measured outer ring radius is scaled to the authored impact radius. The mounting tab is decoration above the disc. The active-target highlighter, cross and moving arrow remain separate presentation effects.

Static terrain art bakes into world canvas tiles up to 1024 pixels, culling empty tiles and cropping the last row/column to the actual extent. The debug overlay reports theme, allocated tile count and canvas pixel storage. Only a few quads are visible per frame. Sparse moving-pivot/exit guides remain a lightweight Graphics layer; they do not allocate a second full-world texture set. Scene shutdown removes each tile texture; the single shared ring texture is reused. Camera routing and the body layer keep their existing ownership. Device-lab boot does not load this kit.

## Level themes

```json
{ "version": 2, "theme": "paper" }
```

`paper` is the default and omits background clouds/birds. `scenery` uses the existing faint pencil doodles as a clearly provisional substitute for the separate background sheet requested in GMR-107. Both use the same ruled paper and gameplay art. No scenery sheet is invented or promoted to approved here.

Theme is validated authoring metadata, retained during migration and stored in a content-owned `WeakMap` keyed by the compiled level. It never becomes an enumerable simulation field, so `levelFingerprint`, PB compatibility and deterministic replay state remain identical. The registry retains this level identity. Authoring HMR compares theme as well as canonical geometry, then uses its existing reset-to-spawn/redraw path. Weak keys allow discarded levels to be collected.

## Verification limits

Owner review fix (2026-10-09): browser pixel checks cover skirt density fading downward, paper interiors, absent lower closure, and paper gaps in spikes/pools. Restoring the original renderer makes the skirt check fail. The Chromium race failure was a held replay axis: `stopReplay()` stopped scheduling but did not release movement. It now queues neutral movement through the ordinary intent queue; the checkpoint test waits for that tick and confirms position remains at the checkpoint after another 300 ms. Restoring the old stop hook makes that assertion fail by 3.46 m. Production input/reset and simulation are unchanged.

Local frame-cost investigation at 1600×900, headless Chromium Canvas, spawn view:

| Level | Pre-kit procedural median | Revised kit median |
| ----- | ------------------------: | -----------------: |
| 1-1   |                  0.483 ms |           0.304 ms |
| 1-2   |                  0.696 ms |           0.462 ms |
| 1-3   |                  0.568 ms |           0.415 ms |

These are synchronous update+render costs, warmed for 120 steps then measured in nine batches of 240 steps, sequentially on the same machine. Baseline is `b263aa9` (GMR-59 merged with main); [raw measurements](evidence/gmr107/frame-cost.json) include all samples and RAF intervals. They show no slowdown in this desktop sample; they do not measure physical-device or asynchronous GPU cost.

Screenshots use Chromium at 1600×900, canvas rendering, default zoom or `?overview=1`. The baseline is the authored pre-kit 1-1/1-2/1-3 renderer from GMR-59 commit 891abc8; the implementation branch follows main including merged #48/#49. Geometry is identical. Timers can differ by a frame; these are visual art comparisons, not replay-frame goldens. Capture code asserts the actual level ID, so 1-3 is never the old placeholder lab.

Physical-device pixel density, subjective foliage/readability and the future scenery background sheet are not validated by desktop screenshots. The small 1x set intentionally trades deep zoom resolution for the existing budget; gameplay uses the fixed default camera scale. Hero artwork and its line weight are outside this issue.
