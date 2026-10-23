import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../../core';
import type { LevelDef } from '../../../sim';
import { rng, seedOf } from './rng';
import {
  paintFar,
  paintForeground,
  paintMid,
  paintMidFar,
  paintShafts,
  paintSky,
  type LayerCanvas,
} from './vista';
import {
  paintNotebookClouds,
  paintNotebookFar,
  paintNotebookForeground,
  paintNotebookMid,
  paintNotebookNear,
} from './notebookVista';

/**
 * Chapter 1 depth (pencil world): parallax layers baked once per level into canvas textures, then
 * only repositioned each frame. Far layers carry the colossal half-sketched landmark in mist, the
 * mid layers cliffs, roots and trees; light shafts sit between them; a dark foreground strip runs
 * along the bottom edge faster than the world. Presentation only: no sim state, no Math.random.
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
  /** Visible view heights of content above the layer bottom (1 = full view). */
  readonly band: number;
  readonly paint: (lc: LayerCanvas, r: () => number) => void;
}

/** Which layers a world bakes, plus its optional light shafts and its foreground strip. */
export interface VistaRecipe {
  readonly id: string;
  readonly layers: readonly LayerSpec[];
  readonly shafts:
    ((c: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void) | null;
  readonly foreground: (c: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;
}

const LAYERS: readonly LayerSpec[] = [
  { id: 'sky', f: 0.03, fy: 0.02, depth: -99.6, scale: 0.3, band: 1, paint: paintSky },
  { id: 'far', f: 0.08, fy: 0.04, depth: -99.4, scale: 0.45, band: 1, paint: paintFar },
  { id: 'midfar', f: 0.18, fy: 0.08, depth: -98.6, scale: 0.5, band: 0.8, paint: paintMidFar },
  { id: 'mid', f: 0.32, fy: 0.14, depth: -98.2, scale: 0.55, band: 0.72, paint: paintMid },
];
export const PENCIL_RECIPE: VistaRecipe = {
  id: 'pencil',
  layers: LAYERS,
  shafts: paintShafts,
  foreground: paintForeground,
};

/**
 * The ruled-notebook backdrop (owner 2026-10-23): doodles on the page itself, transparent so the
 * ruling shows through, at clearly different rates so the world scrolls past like a side-scroller.
 */
export const NOTEBOOK_RECIPE: VistaRecipe = {
  id: 'notebook',
  layers: [
    {
      id: 'clouds',
      f: 0.14,
      fy: 0.05,
      depth: -99.6,
      scale: 0.4,
      band: 1,
      paint: paintNotebookClouds,
    },
    { id: 'far', f: 0.3, fy: 0.1, depth: -99.4, scale: 0.5, band: 0.75, paint: paintNotebookFar },
    { id: 'mid', f: 0.52, fy: 0.18, depth: -98.6, scale: 0.6, band: 0.55, paint: paintNotebookMid },
    {
      id: 'near',
      f: 0.74,
      fy: 0.3,
      depth: -98.2,
      scale: 0.6,
      band: 0.35,
      paint: paintNotebookNear,
    },
  ],
  shafts: null,
  foreground: paintNotebookForeground,
};
const SHAFT_DEPTH = -99;
const SHAFT_W = 512;
const SHAFT_H = 288;
const CHUNK = 2048;
/** Foreground strip: baked against a 720 px tall screen, scaled to the real one. */
const FG_REF_H = 720;
const FG_H = 64;
const FG_W = 2600;
const FG_RATE = 1.35;
export const FOREGROUND_DEPTH = 83;

interface BakedLayer {
  readonly spec: LayerSpec;
  readonly images: Phaser.GameObjects.Image[];
  /** World-pixel size of the whole layer and of its cropped canvas. */
  readonly worldW: number;
  readonly worldH: number;
  readonly cropTop: number;
  offX: number;
  offY: number;
}

export class PencilVista {
  private layers: BakedLayer[] = [];
  private readonly keys: string[] = [];
  private shafts: Phaser.GameObjects.Image | null = null;
  private foreground: Phaser.GameObjects.TileSprite | null = null;
  private fgDisplayKey: string | null = null;
  private bakedView = { w: 0, h: 0 };
  private fgOffset = 0;
  private frozen = false;
  private generation = 0;
  private destroyed = false;
  private readonly seed: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelDef,
    private readonly onObject: (obj: Phaser.GameObjects.GameObject) => void,
    private readonly recipe: VistaRecipe = PENCIL_RECIPE,
  ) {
    this.seed = seedOf(`${recipe.id === 'pencil' ? 'pencil' : recipe.id}:${level.id}`);
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
    if (viewW > this.bakedView.w + 1 || viewH > this.bakedView.h + 1) this.bake(viewW, viewH);
    const vL = camera.midPoint.x - viewW / 2;
    const vT = camera.midPoint.y - viewH / 2;
    const b = this.level.bounds;
    const l0 = m(b.minX) - viewW / 2;
    const t0 = m(b.minY);
    const hold = reducedMotion && this.frozen;
    for (const layer of this.layers) {
      const { spec } = layer;
      if (!hold) {
        layer.offX = clamp(spec.f * (vL - l0), 0, layer.worldW - viewW);
        layer.offY = clamp(spec.fy * (vT - t0), 0, layer.worldH - viewH);
      }
      const x = vL - layer.offX;
      const y = vT - layer.offY + layer.cropTop;
      for (const image of layer.images) {
        const cx = (image.getData('chunkX') as number | undefined) ?? 0;
        image.setPosition(x + cx / spec.scale, y);
      }
    }
    this.shafts?.setPosition(vL, vT).setDisplaySize(viewW, viewH);
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
    const bh = viewH + 32;
    this.bakedView = { w: bw, h: bh };
    const b = this.level.bounds;
    const travelX = m(b.maxX - b.minX);
    const travelY = Math.max(0, m(b.maxY - b.minY) - viewH);
    this.recipe.layers.forEach((spec, index) => {
      const worldW = bw + spec.f * travelX;
      const worldH = bh + spec.fy * travelY;
      const cropH = Math.min(worldH, bh * spec.band + spec.fy * travelY + 8);
      const w = Math.ceil(worldW * spec.scale);
      const h = Math.ceil(cropH * spec.scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext('2d');
      if (!c) return;
      spec.paint(
        { c, w, h, u: viewH * spec.scale, vw: viewW * spec.scale },
        rng(this.seed + index * 7919),
      );
      const images: Phaser.GameObjects.Image[] = [];
      for (let cx = 0, k = 0; cx < w; cx += CHUNK, k++) {
        const cw = Math.min(CHUNK, w - cx);
        const key = `${this.recipe.id}-vista-${this.level.id}-${String(gen)}-${spec.id}-${String(k)}`;
        const tex = this.scene.textures.createCanvas(key, cw, h);
        if (!tex) continue;
        this.keys.push(key);
        tex.getContext().drawImage(canvas, cx, 0, cw, h, 0, 0, cw, h);
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
        cropTop: worldH - cropH,
        offX: 0,
        offY: 0,
      });
    });
    // Light shafts: screen-sized, between the landmark and the nearer cliffs.
    const shaftKey = `${this.recipe.id}-shafts-${String(gen)}`;
    const paintLight = this.recipe.shafts;
    const shaftTex = paintLight
      ? this.scene.textures.createCanvas(shaftKey, SHAFT_W, SHAFT_H)
      : null;
    if (paintLight && shaftTex) {
      this.keys.push(shaftKey);
      paintLight(shaftTex.getContext(), SHAFT_W, SHAFT_H, rng(this.seed + 31337));
      shaftTex.refresh();
      this.shafts = this.scene.add
        .image(0, 0, shaftKey)
        .setOrigin(0, 0)
        .setDepth(SHAFT_DEPTH)
        .setBlendMode('SCREEN');
      this.onObject(this.shafts);
    }
    // Near foreground: dark silhouettes along the bottom edge, on the screen-space camera.
    const fgKey = `${this.recipe.id}-foreground-${String(gen)}`;
    const fgTex = this.scene.textures.createCanvas(fgKey, FG_W, FG_H);
    if (fgTex) {
      this.keys.push(fgKey);
      this.recipe.foreground(fgTex.getContext(), FG_W, FG_H, rng(this.seed + 4242));
      fgTex.refresh();
      this.foreground = this.scene.add
        .tileSprite(0, 0, 1, FG_H, fgKey)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(FOREGROUND_DEPTH)
        .setName(`${this.recipe.id}-foreground`);
      this.fgDisplayKey =
        (this.foreground as unknown as { displayTexture: Phaser.Textures.Texture | null })
          .displayTexture?.key ?? null;
    }
    this.frozen = false;
  }

  private clear(): void {
    for (const layer of this.layers) for (const image of layer.images) image.destroy();
    this.layers = [];
    this.shafts?.destroy();
    this.shafts = null;
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
