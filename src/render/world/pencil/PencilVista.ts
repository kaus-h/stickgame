import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../../core';
import type { LevelDef } from '../../../sim';
import { rng, seedOf } from './rng';
import {
  paintFar,
  paintForeground,
  paintMid,
  paintMidFar,
  paintSky,
  type LayerCanvas,
} from './vista';

/**
 * Chapter 1 depth (pencil world): backdrop layers baked once per level into canvas textures, then
 * only repositioned each frame. Far layers carry the colossal half-sketched landmark in mist, the
 * mid layers cliffs, roots and trees; a dark foreground strip runs along the bottom edge.
 * Presentation only: no sim state, no Math.random.
 */
interface LayerSpec {
  readonly id: string;
  /** Horizontal parallax: 0 is screen-locked, 1 moves with the world. */
  readonly f: number;
  /** Vertical parallax. */
  readonly fy: number;
  readonly depth: number;
  /** Texture pixels per world pixel. */
  readonly scale: number;
  readonly paint: (lc: LayerCanvas, r: () => number) => void;
}

/**
 * Owner 2026-10-23: no parallax and no vertical motion. The backdrop is one painted scene that
 * scrolls past exactly with horizontal progress (f = 1) and is fixed vertically on screen (fy = 0),
 * so jumps, swings and camera lifts never move it up or down. The layers stay separate only so
 * each keeps its own depth order and bake scale.
 */
const LAYERS: readonly LayerSpec[] = [
  { id: 'sky', f: 1, fy: 0, depth: -99.6, scale: 0.25, paint: paintSky },
  { id: 'far', f: 1, fy: 0, depth: -99.4, scale: 0.35, paint: paintFar },
  { id: 'midfar', f: 1, fy: 0, depth: -98.6, scale: 0.4, paint: paintMidFar },
  { id: 'mid', f: 1, fy: 0, depth: -98.2, scale: 0.45, paint: paintMid },
];
const CHUNK = 2048;
/** World pixels the bake reaches below the view bottom. */
const BOTTOM_OVERHANG = 32;
/** Bake headroom above the view top, in view heights: sky and landmarks run on past the edge. */
const TOP_PAD = 0.12;
/** Foreground strip: baked against a 720 px tall screen, scaled to the real one. */
const FG_REF_H = 720;
const FG_H = 64;
const FG_W = 2600;
const FG_RATE = 1;
export const FOREGROUND_DEPTH = 83;

interface BakedLayer {
  readonly spec: LayerSpec;
  readonly images: Phaser.GameObjects.Image[];
  /** World-pixel size of the whole layer, and where its cropped canvas starts below the layer top. */
  readonly worldW: number;
  readonly worldH: number;
  readonly cropTop: number;
  offX: number;
  offY: number;
}

export class PencilVista {
  private layers: BakedLayer[] = [];
  private readonly keys: string[] = [];
  private foreground: Phaser.GameObjects.TileSprite | null = null;
  private fgDisplayKey: string | null = null;
  /** Bake width and the view height the painters laid out for, plus the headroom above it. */
  private baked = { w: 0, viewH: 0, pad: 0 };
  private fgOffset = 0;
  private frozen = false;
  private generation = 0;
  private destroyed = false;
  private readonly seed: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelDef,
    private readonly onObject: (obj: Phaser.GameObjects.GameObject) => void,
  ) {
    this.seed = seedOf(`pencil:${level.id}`);
    scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  /** Reposition every layer for this camera; rebakes only if the view outgrows the bake. */
  update(camera: Phaser.Cameras.Scene2D.Camera, reducedMotion: boolean, screenH: number): void {
    if (this.destroyed) return;
    const zoom = Math.max(0.0001, camera.zoom);
    const viewW = camera.width / zoom;
    const viewH = camera.height / zoom;
    if (viewW > this.baked.w + 1 || viewH > this.baked.viewH + 1) this.bake(viewW, viewH);
    // The view as it will render. centerOn() leaves midPoint at the requested, unclamped centre
    // until Phaser's preRender (after this update), while scroll is already clamped to the level
    // bounds; preRender derives the centre from scroll exactly like this.
    const vL = camera.scrollX + camera.width / 2 - viewW / 2;
    const vT = camera.scrollY + camera.height / 2 - viewH / 2;
    // Layers hang from the view bottom, where the painters lay their content out; a view shorter
    // than the bake only uncovers more of the headroom above.
    const layoutTop = vT + viewH - this.baked.viewH - this.baked.pad;
    const b = this.level.bounds;
    const l0 = m(b.minX) - viewW / 2;
    const t0 = m(b.minY);
    const seen = this.baked.viewH + this.baked.pad + BOTTOM_OVERHANG;
    const hold = reducedMotion && this.frozen;
    for (const layer of this.layers) {
      const { spec } = layer;
      if (!hold) {
        layer.offX = clamp(spec.f * (vL - l0), 0, layer.worldW - viewW);
        layer.offY = clamp(spec.fy * (vT - t0), 0, layer.worldH - seen);
      }
      const x = vL - layer.offX;
      const y = layoutTop - layer.offY + layer.cropTop;
      for (const image of layer.images) {
        const cx = (image.getData('chunkX') as number | undefined) ?? 0;
        image.setPosition(x + cx / spec.scale, y);
      }
    }
    if (this.foreground) {
      const scale = screenH / FG_REF_H;
      const screenW = camera.width;
      if (!hold) this.fgOffset = (camera.scrollX * zoom * FG_RATE) / scale;
      this.foreground
        .setScale(scale)
        .setSize(Math.ceil(screenW / scale) + 2, FG_H)
        .setPosition(camera.x, camera.y + camera.height - FG_H * scale)
        .setTilePosition(positiveModulo(this.fgOffset, FG_W), 0);
    }
    this.frozen = true;
  }

  presentation(): {
    layers: number;
    textures: number;
    surfacePixels: number;
    offsets: { id: string; x: number; y: number }[];
    foreground: { offset: number; top: number; height: number } | null;
  } {
    let px = 0;
    for (const key of this.keys) {
      const t = this.scene.textures.exists(key) ? this.scene.textures.get(key) : null;
      const src = t?.getSourceImage() as { width?: number; height?: number } | undefined;
      px += (src?.width ?? 0) * (src?.height ?? 0);
    }
    const fg = this.foreground;
    return {
      layers: this.layers.length,
      textures: this.keys.length,
      surfacePixels: px,
      offsets: this.layers.map((l) => ({ id: l.spec.id, x: l.offX, y: l.offY })),
      foreground: fg ? { offset: this.fgOffset, top: fg.y, height: fg.height * fg.scaleY } : null,
    };
  }

  private bake(viewW: number, viewH: number): void {
    this.clear();
    const gen = this.generation++;
    // Leave room for wider screens and resizes without a rebake.
    const bw = Math.max(viewW, viewH * 1.9) + 64;
    const pad = Math.ceil(viewH * TOP_PAD);
    this.baked = { w: bw, viewH, pad };
    const b = this.level.bounds;
    const travelX = m(b.maxX - b.minX);
    const travelY = Math.max(0, m(b.maxY - b.minY) - viewH);
    LAYERS.forEach((spec, index) => {
      const worldW = bw + spec.f * travelX;
      const worldH = pad + viewH + BOTTOM_OVERHANG + spec.fy * travelY;
      const w = Math.ceil(worldW * spec.scale);
      const full = Math.ceil(worldH * spec.scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = full;
      const c = canvas.getContext('2d');
      if (!c) return;
      spec.paint(
        {
          c,
          w,
          h: full,
          u: viewH * spec.scale,
          vw: viewW * spec.scale,
          vt: full - (viewH + BOTTOM_OVERHANG) * spec.scale,
        },
        rng(this.seed + index * 7919),
      );
      // Keep only rows that hold marks (the near layers stay low), so nothing is ever cut flat.
      const top = Math.min(full - 1, Math.max(0, firstInkRow(c, w, full) - 2));
      const h = full - top;
      const images: Phaser.GameObjects.Image[] = [];
      for (let cx = 0, k = 0; cx < w; cx += CHUNK, k++) {
        const cw = Math.min(CHUNK, w - cx);
        const key = `pencil-vista-${this.level.id}-${String(gen)}-${spec.id}-${String(k)}`;
        const tex = this.scene.textures.createCanvas(key, cw, h);
        if (!tex) continue;
        this.keys.push(key);
        tex.getContext().drawImage(canvas, cx, top, cw, h, 0, 0, cw, h);
        tex.refresh();
        const image = this.scene.add
          .image(0, 0, key)
          .setOrigin(0, 0)
          .setScale(1 / spec.scale)
          .setDepth(spec.depth)
          .setData('chunkX', cx);
        images.push(image);
        this.onObject(image);
      }
      this.layers.push({
        spec,
        images,
        worldW,
        worldH,
        cropTop: top / spec.scale,
        offX: 0,
        offY: 0,
      });
    });
    // Near foreground: dark silhouettes along the bottom edge, on the screen-space camera.
    const fgKey = `pencil-foreground-${String(gen)}`;
    const fgTex = this.scene.textures.createCanvas(fgKey, FG_W, FG_H);
    if (fgTex) {
      this.keys.push(fgKey);
      paintForeground(fgTex.getContext(), FG_W, FG_H, rng(this.seed + 4242));
      fgTex.refresh();
      this.foreground = this.scene.add
        .tileSprite(0, 0, 1, FG_H, fgKey)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(FOREGROUND_DEPTH)
        .setName('pencil-foreground');
      this.fgDisplayKey =
        (this.foreground as unknown as { displayTexture: Phaser.Textures.Texture | null })
          .displayTexture?.key ?? null;
    }
    this.frozen = false;
  }

  private clear(): void {
    for (const layer of this.layers) for (const image of layer.images) image.destroy();
    this.layers = [];
    this.foreground?.destroy();
    this.foreground = null;
    const textures = this.scene.textures;
    if (this.fgDisplayKey && textures.exists(this.fgDisplayKey)) textures.remove(this.fgDisplayKey);
    this.fgDisplayKey = null;
    for (const key of this.keys) if (textures.exists(key)) textures.remove(key);
    this.keys.length = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
  }
}

/** First canvas row with any painted pixel, read in growing strips from the top; `h` if blank. */
function firstInkRow(c: CanvasRenderingContext2D, w: number, h: number): number {
  for (let y0 = 0, rows = 16; y0 < h; y0 += rows, rows *= 2) {
    const alpha = c.getImageData(0, y0, w, Math.min(rows, h - y0)).data;
    for (let i = 3; i < alpha.length; i += 4)
      if (alpha[i] !== 0) return y0 + Math.floor((i - 3) / 4 / w);
  }
  return h;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
