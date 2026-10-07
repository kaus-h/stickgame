# 0005 — Transparent asset sheet (pipeline test)

- Date: 2026-10-07
- Tool: ChatGPT image generation (StickGame project, chat "Generate Game Art Sheet"), following 0004
- Output: `assets/sheets/0005-asset-sheet-v1.png` (1254×1254, RGBA, transparent background)
- Sliced with `npm run art:slice -- assets/sheets/0005-asset-sheet-v1.png assets/art/test-0005 --spec assets/sheets/0005-asset-sheet-v1.spec.json`
- Verdict: **Accepted for the pipeline test only.** Real transparency; all four anchor states share one silhouette; the highlighted active anchor and red hazard read instantly at gameplay scale on desktop and phone. Problems: grey fills on stone (painterly, not pure ink); grass tufts blur the walkable top edges; middle platform piece and hazard strip do not tile seamlessly. A pure-ink revision (v2) was requested.

## Prompt

That revision is approved as the direction. Now generate a production asset sheet in exactly the same drawing style (black ink contours with slight wobble, black crosshatching and scribble shading, no blue ink), on a fully TRANSPARENT background: no paper, no ruled lines, no margin, because the engine draws the notebook page separately. Square 1:1, objects in flat side view, laid out on a loose grid with generous empty space between them, no labels and no text. Contents: (1) stone-block platform pieces: a left end, a middle piece that tiles seamlessly left-to-right, a right end, and one small floating block; every piece has one clean, bold, unbroken walkable top edge and crosshatched faces underneath. (2) A rope-anchor family that shares one silhouette, an iron ring bolted into a small stone mount, in four states: inactive (plain black ink); active (same, with a quick yellow highlighter swipe behind it); timed (the ring drawn as a dashed circle, half filled with crosshatching); one-use (the ring cracked). (3) A hazard strip that tiles seamlessly left-to-right: thorns and tooth-shaped spikes drawn with black ink outlines and filled with red ballpoint scribble. (4) The arched door exit from the mockup, isolated. Do not imitate any specific existing artist or artwork.

## Pipeline finding

Generated platform tiles repeat visibly and never match collision exactly. Candidate (for GMR-98/GMR-39): draw platforms and solid geometry procedurally as pen strokes from the level's collision shapes (wobbly outline, hatching, cracks), and use generated images for objects (anchors, doors, enemies, the hero, decoration).
