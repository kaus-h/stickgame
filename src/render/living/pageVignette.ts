import type * as Phaser from 'phaser';
import { NOTEBOOK_STYLE, type WorldStyle } from '../world/WorldStyle';

const KEY = 'page-lamp';

export function pageVignetteTextureKey(style: WorldStyle = NOTEBOOK_STYLE): string {
  return style.id === NOTEBOOK_STYLE.id ? KEY : `${KEY}:${style.id}`;
}
const W = 1024;
const H = 576;
/** Where the lamp's pool of light falls, as a fraction of the screen. */
export const LAMP_CENTRE = NOTEBOOK_STYLE.lamp.centre;

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
  style: WorldStyle = NOTEBOOK_STYLE,
): Phaser.GameObjects.Image | null {
  const textures = scene.textures as Phaser.Scene['textures'] | undefined;
  if (!textures) return null;
  const key = pageVignetteTextureKey(style);
  if (!textures.exists(key)) {
    const t = textures.createCanvas(key, W, H);
    if (!t) return null;
    const c = t.getContext();
    if (style.light === 'graphite-shafts') {
      paintGraphiteVignette(c, W, H);
      t.refresh();
      return addImage(scene, key, depth);
    }
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    const cx = W * style.lamp.centre.x,
      cy = H * style.lamp.centre.y;
    const pool = c.createRadialGradient(cx, cy, H * 0.12, cx, cy, W * 0.62);
    for (const stop of style.lamp.pool) pool.addColorStop(stop.offset, stop.color);
    c.fillStyle = pool;
    c.fillRect(0, 0, W, H);
    // The page bends down into the binding: a soft cool shade along the spiral edge.
    c.globalCompositeOperation = 'multiply';
    const gutter = c.createLinearGradient(0, 0, W * 0.16, 0);
    for (const stop of style.lamp.gutter) gutter.addColorStop(stop.offset, stop.color);
    c.fillStyle = gutter;
    c.fillRect(0, 0, W * 0.16, H);
    // The lamp sits beyond the top edge: the bottom of the page is a touch further from it.
    const fall = c.createLinearGradient(0, H * 0.55, 0, H);
    for (const stop of style.lamp.fall) fall.addColorStop(stop.offset, stop.color);
    c.fillStyle = fall;
    c.fillRect(0, H * 0.55, W, H * 0.45);
    c.globalCompositeOperation = 'source-over';
    t.refresh();
  }
  return addImage(scene, key, depth);
}

function addImage(scene: Phaser.Scene, key: string, depth: number): Phaser.GameObjects.Image {
  return scene.add
    .image(0, 0, key)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth)
    .setBlendMode('MULTIPLY');
}

/**
 * Chapter 1 light (pencil world): the page is lit from the upper right, so graphite gathers
 * toward the edges and pools heavily along the bottom, where the eye rests least. The centre
 * band, where the hero, anchors and rope live, stays almost untouched (multiply by near-white).
 */
function paintGraphiteVignette(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  const cx = w * 0.6,
    cy = h * 0.36;
  const pool = c.createRadialGradient(cx, cy, h * 0.18, cx, cy, w * 0.66);
  pool.addColorStop(0, 'rgb(255,255,255)');
  pool.addColorStop(0.45, 'rgb(246,247,249)');
  pool.addColorStop(0.75, 'rgb(196,199,205)');
  pool.addColorStop(1, 'rgb(128,131,138)');
  c.fillStyle = pool;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'multiply';
  // Heavier graphite toward the bottom edge.
  const fall = c.createLinearGradient(0, h * 0.62, 0, h);
  fall.addColorStop(0, 'rgb(255,255,255)');
  fall.addColorStop(0.6, 'rgb(220,222,226)');
  fall.addColorStop(1, 'rgb(150,152,158)');
  c.fillStyle = fall;
  c.fillRect(0, h * 0.62, w, h * 0.38);
  // The far left is furthest from the light.
  const left = c.createLinearGradient(0, 0, w * 0.22, 0);
  left.addColorStop(0, 'rgb(196,198,203)');
  left.addColorStop(1, 'rgb(255,255,255)');
  c.fillStyle = left;
  c.fillRect(0, 0, w * 0.22, h);
  c.globalCompositeOperation = 'source-over';
}
