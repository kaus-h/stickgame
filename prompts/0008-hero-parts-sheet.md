# 0008: hero parts sheet (no scarf)

Tool: ChatGPT image generation, GPT-6 at High effort, in the same new chat as 0007, 2026-10-07. Result: `assets/concepts/0008-hero-parts-sheet.png` (1254×1254).

Prompt (verbatim):

> This is the hero. Now create a separated-parts sheet of this exact character for a cutout animation rig, same pure black ballpoint ink on plain white and the same line style. Every part fully separated with generous white space, no overlaps: the head in three views (facing right, three-quarter, front) with the solid oval eyes, stitched mouth and underside hatching; one fail-state head with X eyes; the neck-and-torso line; upper arm; forearm with round hand; thigh; shin with solid black boot. Limb segments with rounded ends so they can pivot at joints. No scarf, no accessories, no text, no labels, no grey tones, no background. Square 1:1, high resolution.

Verdict:

- **Heads: accept as candidates.** Right-facing, three-quarter, front, and X-eyed fail. They match 0007 and could replace the procedural head if the owner prefers drawn heads (GMR-69).
- **Limbs and torso: reject.** They came out as double-line tubes with pivot rings, unlike the hero's single-line limbs. Limbs stay procedural pen strokes in `render/hero/drawHero.ts`, which suits a stick figure and animates for free.
