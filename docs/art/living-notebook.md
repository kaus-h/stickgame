# The Living Notebook (visual pass, 2026-10-12)

**Goal:** make StickSwing gorgeous. The world is a notebook page that a hand is still drawing: every line lives, everything reacts to the player, and the page has depth. Owner direction: beauty first, optimization later.

## What is wrong today

- The page is static. Only the hero moves, and terrain, anchors and hazards are frozen vector.
- Hazards read as digital rectangles with a texture, not as drawn red ink.
- There's no reaction to the player: no dust, no speed, no ink spray when the rope bites.
- There's no depth: one flat layer of slabs on empty paper.

## Pillars

1. **Line boil:** ink redraws on a 3-frame cycle at about 8 fps, like hand-drawn animation. It is deterministic (seeded variants, not noise), and reduced motion holds a single frame.
2. **Drawn hazards:** red ballpoint scribble pools with a boiling wavy surface, slow drips and bubbles that pop into loops. Spikes are inked thorns.
3. **Juice in ink:**
   - speed hatching behind fast motion;
   - scribble dust on landings and take-offs;
   - an ink blot and splash when the rope bites;
   - a pen-flick on release;
   - a rope that draws itself on from hand to anchor.
4. **Depth:**
   - layered pencil sketches far behind, very light;
   - a soft pencil-shading vignette at the page edges;
   - margin doodles that react when you pass.
5. **Transitions:** the level draws itself in at start, and an accepted exit turns the page. There is never a delay between death and retry.
6. **Front of house:** a hand-lettered title with the hero swinging on the title page.

## Rules that do not bend

- Red is lethal only. The highlighter marks the targeted anchor. Collision is authored and art follows it.
- Effects are presentation only: no sim changes, no new verbs.
- The reduced-motion and high-contrast settings get calm, readable variants.
