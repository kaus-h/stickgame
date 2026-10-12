import type * as Phaser from 'phaser';
import { hash } from '../ink';

/**
 * Line boil (Living Notebook pillar 1): every inked line wobbles a little and redraws on a
 * three-drawing cycle, like hand-drawn animation. A camera Displacement filter samples a small
 * noise texture. The noise is a function of *world* position, rewritten every frame for the
 * current view, so the wobble sticks to the drawing as the camera moves and only changes when the
 * drawing changes (8 times a second). No simulation state is read or written.
 */
export const BOIL_FPS = 8;
/** Distinct drawings in the cycle (classic boil uses 3). */
export const BOIL_DRAWINGS = 3;
/** Wobble wavelength on the page, in world pixels (about a third of a meter). */
export const BOIL_CELL = 22;
/** Peak line displacement, in screen pixels at 1080p. */
export const BOIL_PIXELS = 1.6;
/** Displacement texture size; bilinear filtering smooths between texels. */
const TEX_W = 192;
const TEX_H = 108;

/** Which drawing of the cycle is showing at a wall-clock time (seconds). */
export function boilDrawing(seconds: number): number {
  return Math.floor(seconds * BOIL_FPS) % BOIL_DRAWINGS;
}

/** Smooth value noise in 0..1 on a world lattice; one independent field per drawing and channel. */
export function boilNoise(wx: number, wy: number, drawing: number, channel: number): number {
  const gx = wx / BOIL_CELL;
  const gy = wy / BOIL_CELL;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const seed = drawing * 7.31 + channel * 113.7;
  const v = (x: number, y: number) => hash(x * 0.0173 + y * 0.9131 + seed);
  const a = v(ix, iy);
  const b = v(ix + 1, iy);
  const c = v(ix, iy + 1);
  const d = v(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Fill an RGBA buffer with the displacement field for a world-space view rectangle. R and G are
 * the x and y offsets, centred on 128 (no displacement).
 */
export function writeBoilField(
  out: Uint8ClampedArray,
  w: number,
  h: number,
  view: { x: number; y: number; width: number; height: number },
  drawing: number,
): void {
  for (let j = 0; j < h; j++) {
    const wy = view.y + ((j + 0.5) / h) * view.height;
    for (let i = 0; i < w; i++) {
      const wx = view.x + ((i + 0.5) / w) * view.width;
      const o = (j * w + i) * 4;
      out[o] = Math.round(boilNoise(wx, wy, drawing, 0) * 255);
      out[o + 1] = Math.round(boilNoise(wx, wy, drawing, 1) * 255);
      out[o + 2] = 128;
      out[o + 3] = 255;
    }
  }
}

/** Owns the noise texture and the camera filter. */
export class LineBoil {
  private readonly texture: ReturnType<Phaser.Scene['textures']['createCanvas']>;
  private readonly filter: { x: number; y: number; setTexture(key: string): unknown } | null;
  private readonly image: ImageData | null;
  private enabled = true;
  /** Peak displacement in 1080p pixels; `?boil=N` overrides it for tuning (0 turns it off). */
  private readonly pixels: number;

  constructor(
    scene: Phaser.Scene,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    key = 'line-boil',
  ) {
    const tuned =
      typeof window === 'undefined'
        ? null
        : Number(new URLSearchParams(window.location.search).get('boil') ?? NaN);
    this.pixels = tuned !== null && Number.isFinite(tuned) ? tuned : BOIL_PIXELS;
    // Headless test scenes have no texture manager: the page simply does not boil.
    const textures = scene.textures as Phaser.Scene['textures'] | undefined;
    if (textures?.exists(key)) textures.remove(key);
    const texture = textures?.createCanvas(key, TEX_W, TEX_H) ?? null;
    const filters = (
      camera as unknown as {
        filters?: {
          internal: {
            addDisplacement(
              key: string,
              x: number,
              y: number,
            ): { x: number; y: number; setTexture(key: string): unknown };
          };
        };
      }
    ).filters;
    // Canvas renderer or a build without filters: the page simply does not boil.
    if (!texture || !filters) {
      this.texture = null;
      this.filter = null;
      this.image = null;
      return;
    }
    this.texture = texture;
    this.image = texture.context.createImageData(TEX_W, TEX_H);
    this.filter = filters.internal.addDisplacement(key, 0, 0);
  }

  /** Off for reduced motion: the drawing holds still. */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  update(seconds: number): void {
    if (!this.texture || !this.filter || !this.image) return;
    const cam = this.camera;
    // The shader offsets UVs by (sample - 0.5) * amount, so amount = 2 * peak / size.
    const scale = cam.height / 1080;
    this.filter.x = this.enabled ? (2 * this.pixels * scale) / cam.width : 0;
    this.filter.y = this.enabled ? (2 * this.pixels * scale) / cam.height : 0;
    if (!this.enabled) return;
    writeBoilField(this.image.data, TEX_W, TEX_H, cam.worldView, boilDrawing(seconds));
    this.texture.context.putImageData(this.image, 0, 0);
    this.texture.refresh();
  }
}
