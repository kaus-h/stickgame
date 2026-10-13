import handFontUrl from '@fontsource/mansalva/files/mansalva-latin-400-normal.woff?url';

/**
 * The game's one hand: Mansalva, an upright felt-tip marker (owner, 2026-10-12: replaced Caveat).
 * Self-hosted through @fontsource so web, native and offline builds draw the same letters.
 */
export const HAND_FAMILY = 'Mansalva';
export const HAND_FONT = `"${HAND_FAMILY}", "Comic Sans MS", cursive`;

/**
 * Register and load the hand before Phaser rasterizes any text. Only the WOFF file ships: it is
 * the smaller of the two here, every target browser reads it, and the dist budget is tight.
 */
export async function loadHandFont(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  const face = new FontFace(HAND_FAMILY, `url(${handFontUrl}) format('woff')`, { display: 'swap' });
  document.fonts.add(face);
  await face.load();
}
