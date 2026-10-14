import type * as Phaser from 'phaser';

const KEY = 'page-lamp';
const W = 1024;
const H = 576;
/** Where the lamp's pool of light falls, as a fraction of the screen. */
export const LAMP_CENTRE = { x: 0.56, y: 0.34 } as const;

/**
 * Lamplight on the page (owner playtest 2026-10-12: "polished, immersive, atmospheric"). The page
 * lies under a warm desk lamp: a soft pool of light a little above centre, warm graphite falling
 * off toward the corners, and the paper curving down into the spiral binding on the left.
 * Multiplied over everything below it, so black ink stays black and white paper turns warm; it
 * is screen-fixed on the UI camera, under the HUD, and never touches the world or the sim.
 *
 * Owner checkpoint 2026-10-13: "a bit" darker, a tunnel feel but "not much". The pool is a little
 * tighter and the corners a little deeper; the centre, where the hero and the next anchor sit,
 * keeps its white paper so ink contrast there is unchanged.
 *
 * Owner checkpoint 2026-10-14: the darkness is right, the colour "slightly less yellow". The same
 * luminance at every stop, with about a third of the blue deficit taken out.
 */
export function addPageVignette(
  scene: Phaser.Scene,
  depth: number,
): Phaser.GameObjects.Image | null {
  const textures = scene.textures as Phaser.Scene['textures'] | undefined;
  if (!textures) return null;
  if (!textures.exists(KEY)) {
    const t = textures.createCanvas(KEY, W, H);
    if (!t) return null;
    const c = t.getContext();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    const cx = W * LAMP_CENTRE.x,
      cy = H * LAMP_CENTRE.y;
    const pool = c.createRadialGradient(cx, cy, H * 0.12, cx, cy, W * 0.62);
    pool.addColorStop(0, 'rgb(255, 255, 253)');
    pool.addColorStop(0.26, 'rgb(251, 249, 245)');
    pool.addColorStop(0.6, 'rgb(225, 218, 206)');
    pool.addColorStop(1, 'rgb(168, 158, 144)');
    c.fillStyle = pool;
    c.fillRect(0, 0, W, H);
    // The page bends down into the binding: a soft cool shade along the spiral edge.
    c.globalCompositeOperation = 'multiply';
    const gutter = c.createLinearGradient(0, 0, W * 0.16, 0);
    gutter.addColorStop(0, 'rgb(176, 170, 162)');
    gutter.addColorStop(0.35, 'rgb(222, 218, 211)');
    gutter.addColorStop(1, 'rgb(255, 255, 255)');
    c.fillStyle = gutter;
    c.fillRect(0, 0, W * 0.16, H);
    // The lamp sits beyond the top edge: the bottom of the page is a touch further from it.
    const fall = c.createLinearGradient(0, H * 0.55, 0, H);
    fall.addColorStop(0, 'rgb(255, 255, 255)');
    fall.addColorStop(1, 'rgb(234, 231, 225)');
    c.fillStyle = fall;
    c.fillRect(0, H * 0.55, W, H * 0.45);
    c.globalCompositeOperation = 'source-over';
    t.refresh();
  }
  return scene.add
    .image(0, 0, KEY)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth)
    .setBlendMode('MULTIPLY');
}
