/**
 * The game's one hand: Mansalva, an upright felt-tip marker (owner, 2026-10-12: replaced Caveat).
 * Self-hosted through @fontsource so web, native and offline builds draw the same letters; the
 * composition roots import its CSS and wait for it before Phaser rasterizes any text.
 */
export const HAND_FAMILY = 'Mansalva';
export const HAND_FONT = `"${HAND_FAMILY}", "Comic Sans MS", cursive`;
/** A size string for `document.fonts.load`, so text never rasterizes in a fallback face. */
export const HAND_PROBE = `34px "${HAND_FAMILY}"`;
