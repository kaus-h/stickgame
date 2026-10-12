import type * as Phaser from 'phaser';

const KEY = 'page-vignette';
const SIZE = 512;
/** Edge darkness: soft graphite, low enough that the edges of the play space stay readable. */
export const VIGNETTE_ALPHA = 0.2;

/**
 * Soft graphite toward the screen edges (Living Notebook pillar 4): depth without a frame. A
 * screen-fixed image on the UI camera, under the HUD; it never touches the world or the sim.
 */
export function addPageVignette(
  scene: Phaser.Scene,
  depth: number,
): Phaser.GameObjects.Image | null {
  const textures = scene.textures as Phaser.Scene['textures'] | undefined;
  if (!textures) return null;
  if (!textures.exists(KEY)) {
    const t = textures.createCanvas(KEY, SIZE, SIZE);
    if (!t) return null;
    const c = t.getContext();
    const g = c.createRadialGradient(
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.32,
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.74,
    );
    g.addColorStop(0, 'rgba(77,68,58,0)');
    g.addColorStop(0.6, `rgba(77,68,58,${String(VIGNETTE_ALPHA * 0.45)})`);
    g.addColorStop(1, `rgba(60,52,44,${String(VIGNETTE_ALPHA)})`);
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);
    t.refresh();
  }
  return scene.add.image(0, 0, KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
}
