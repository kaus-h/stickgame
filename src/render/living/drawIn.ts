import type * as Phaser from 'phaser';
import { ensurePaperTexture, PAPER_KEY } from '../page/NotebookPage';
import { hash, strokeInk } from '../ink';

const INK = 0x16161a;
/** The level inks itself onto the page over this long when it first appears (s). */
export const DRAW_IN_SECONDS = 0.6;

/** Eased reveal progress 0..1 for the time since the level appeared. */
export function drawInProgress(seconds: number): number {
  const u = Math.min(1, Math.max(0, seconds / DRAW_IN_SECONDS));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/**
 * Level draw-in (Living Notebook pillar 5): a blank, world-aligned sheet of the same paper covers
 * the view and pulls away left to right behind a band of pen hatching, as if the page were being
 * inked. Only on a level's first appearance; a death never triggers it, so retry stays instant.
 */
export class DrawIn {
  private readonly cover: Phaser.GameObjects.TileSprite;
  private readonly pen: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private done = false;

  constructor(scene: Phaser.Scene, skip: boolean) {
    // Headless test scenes have no texture manager.
    if ((scene.textures as Phaser.Scene['textures'] | undefined) !== undefined)
      ensurePaperTexture(scene);
    this.cover = scene.add.tileSprite(0, 0, 1, 1, PAPER_KEY).setOrigin(0, 0).setDepth(60);
    this.pen = scene.add.graphics().setDepth(61);
    if (skip) this.finish();
  }

  get finished(): boolean {
    return this.done;
  }

  /** Advance and lay the cover over the part of the world view not yet inked. */
  update(dt: number, view: { x: number; y: number; width: number; height: number }): void {
    if (this.done) return;
    this.elapsed += dt;
    const p = drawInProgress(this.elapsed);
    if (p >= 1) {
      this.finish();
      return;
    }
    const pad = 4;
    const front = view.x + view.width * p;
    const x = Math.floor(front);
    const y = Math.floor(view.y - pad);
    const w = Math.ceil(view.x + view.width + pad - x);
    const h = Math.ceil(view.height + pad * 2);
    // Texture coordinates equal world pixels, so the cover's ruling matches the page exactly.
    this.cover.setPosition(x, y).setSize(w, h).setTilePosition(x, y);
    // The pen front: a ragged band of quick diagonal strokes, darkest at the leading edge.
    const g = this.pen;
    g.clear();
    const band = Math.min(90, view.width * 0.08);
    const rows = Math.ceil(h / 7);
    for (let r = 0; r < rows; r++) {
      const yy = y + r * 7 + hash(r * 0.71) * 4;
      const depth = band * (0.35 + 0.65 * hash(r * 1.37 + Math.floor(this.elapsed * 30) * 0.1));
      const x0 = front - depth;
      strokeInk(
        g,
        [
          { x: x0, y: yy + 5 },
          { x: front + 2, y: yy - 3 },
        ],
        1.2,
        INK,
        0.35 + 0.45 * hash(r * 2.3),
        r,
      );
    }
  }

  private finish(): void {
    this.done = true;
    this.cover.setVisible(false);
    this.pen.clear().setVisible(false);
  }
}
