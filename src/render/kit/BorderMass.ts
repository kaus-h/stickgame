import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef } from '../../sim';
import {
  outsideTerrainRects,
  type HorizontalInterval,
  type OutsideTerrainRect,
  type ProjectedTerrainBounds,
} from './outsideTerrainRects';

import { NOTEBOOK_STYLE, worldColorCss, type WorldStyle } from '../world/WorldStyle';

const HATCH_KEY = 'terrain-border-hatch-256';
const hatchKey = (style: WorldStyle): string =>
  style.id === 'notebook' ? HATCH_KEY : `${HATCH_KEY}-${style.id}`;
const HATCH_SIZE = 256;
const EPSILON = 1e-7;

function ensureHatchTexture(scene: Phaser.Scene, style: WorldStyle): boolean {
  if (scene.textures.exists(hatchKey(style))) return true;
  const texture = scene.textures.createCanvas(hatchKey(style), HATCH_SIZE, HATCH_SIZE);
  if (!texture) return false;
  const context = texture.getContext();
  context.clearRect(0, 0, HATCH_SIZE, HATCH_SIZE);
  context.lineCap = 'round';
  context.strokeStyle = worldColorCss(style.terrainBorderInk);

  // Both fields tile seamlessly in 256 px: the -1.5 family shifts by 384 px and
  // the 0.5 family by 128 px over one horizontal repeat, while offsets cycle by 128.
  const fields = [
    { slope: -1.5, spacing: 8, baseAlpha: 0.85 },
    { slope: 0.5, spacing: 16, baseAlpha: 0.6 },
  ];
  for (const field of fields) {
    for (let offset = -512; offset <= 768; offset += field.spacing / style.hatchDensity) {
      const phase = (2 * Math.PI * offset) / 128;
      context.globalAlpha = field.baseAlpha + Math.sin(phase) * 0.025;
      context.lineWidth = 0.58 + (Math.sin(phase + 0.8) + 1) * 0.12;
      context.beginPath();
      for (let x = -512; x <= 512; x += 8) {
        const wave = Math.sin((2 * Math.PI * x) / 256 + phase) * 0.8;
        const grain = Math.sin((2 * Math.PI * (x + offset)) / 128) * 0.35;
        const y = field.slope * x + offset + wave + grain;
        if (x === -512) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  texture.refresh();
  return true;
}

/** X spans where solid polygons meet the level's upper boundary. */
function topBoundColumns(level: LevelDef): HorizontalInterval[] {
  const y = level.bounds.minY;
  const columns: HorizontalInterval[] = [];
  for (const solid of level.solids) {
    if (solid.kind !== 'solid') continue;
    const xs: number[] = [];
    for (let i = 0; i < solid.points.length; i++) {
      const a = solid.points[i];
      const b = solid.points[(i + 1) % solid.points.length];
      if (!a || !b) continue;
      const aOn = Math.abs(a.y - y) <= EPSILON;
      const bOn = Math.abs(b.y - y) <= EPSILON;
      if (aOn && bOn) {
        columns.push({ left: Math.min(a.x, b.x), right: Math.max(a.x, b.x) });
      } else if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + (b.x - a.x) * t);
      } else {
        if (aOn) xs.push(a.x);
        if (bOn) xs.push(b.x);
      }
    }
    xs.sort((a, b) => a - b);
    const unique = xs.filter((x, index) => index === 0 || x - (xs[index - 1] ?? x) > EPSILON);
    for (let i = 0; i + 1 < unique.length; i += 2) {
      const left = unique[i];
      const right = unique[i + 1];
      if (left !== undefined && right !== undefined && right - left > EPSILON) {
        columns.push({ left, right });
      }
    }
  }

  columns.sort((a, b) => a.left - b.left || a.right - b.right);
  const merged: HorizontalInterval[] = [];
  for (const column of columns) {
    const previous = merged[merged.length - 1];
    if (previous && column.left <= previous.right + EPSILON) {
      merged[merged.length - 1] = {
        left: previous.left,
        right: Math.max(previous.right, column.right),
      };
    } else {
      merged.push(column);
    }
  }
  return merged;
}

type CameraState = readonly [number, number, number, number, number, number, number];

/** Dense, world-phased hatching only in the viewport area outside level bounds. */
export class BorderMass {
  private readonly sprites: Phaser.GameObjects.TileSprite[] = [];
  private readonly displayTextureKeys: string[] = [];
  private readonly topColumns: HorizontalInterval[];
  private readonly textureReady: boolean;
  private readonly canvasRenderer: boolean;
  private lastCamera: CameraState | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelDef,
    private readonly style: WorldStyle = NOTEBOOK_STYLE,
  ) {
    this.textureReady = ensureHatchTexture(scene, style);
    this.topColumns = topBoundColumns(level);
    this.canvasRenderer = !(scene.sys.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    scene.events.once('shutdown', () => {
      // Phaser releases TileSprite canvases but leaves their private CanvasTexture registered.
      for (const key of this.displayTextureKeys) {
        if (scene.textures.exists(key)) scene.textures.remove(key);
      }
    });
  }

  /** Reproject only when the world camera changes; stationary frames do no tile work. */
  update(): void {
    if (!this.textureReady) return;
    const camera = this.scene.cameras.main;
    const zoom = camera.zoom;
    if (!(zoom > 0)) return;
    const state: CameraState = [
      camera.scrollX,
      camera.scrollY,
      zoom,
      camera.x,
      camera.y,
      camera.width,
      camera.height,
    ];
    if (this.lastCamera && state.every((value, index) => value === this.lastCamera?.[index]))
      return;
    this.lastCamera = state;

    const projectX = (worldX: number): number =>
      (worldX - camera.scrollX - camera.width / 2) * zoom + camera.width / 2 + camera.x;
    const projectY = (worldY: number): number =>
      (worldY - camera.scrollY - camera.height / 2) * zoom + camera.height / 2 + camera.y;
    const b = this.level.bounds;
    const projected: ProjectedTerrainBounds = {
      left: projectX(m(b.minX)) - camera.x,
      top: projectY(m(b.minY)) - camera.y,
      right: projectX(m(b.maxX)) - camera.x,
      bottom: projectY(m(b.maxY)) - camera.y,
    };
    const topColumns = this.topColumns.map(({ left, right }) => ({
      left: projectX(m(left)) - camera.x,
      right: projectX(m(right)) - camera.x,
    }));
    const rects = outsideTerrainRects(
      projected,
      { width: camera.width, height: camera.height },
      topColumns,
    );
    this.applyRects(rects, camera, zoom);
  }

  stats(): { tiles: number; surfacePixels: number } {
    const outputs = this.sprites.reduce((sum, sprite) => {
      const canvas = sprite.canvas;
      return sum + (this.canvasRenderer && canvas ? canvas.width * canvas.height : 0);
    }, 0);
    return { tiles: this.sprites.length + 1, surfacePixels: HATCH_SIZE * HATCH_SIZE + outputs };
  }

  private applyRects(
    rects: readonly OutsideTerrainRect[],
    camera: Phaser.Cameras.Scene2D.Camera,
    zoom: number,
  ): void {
    while (this.sprites.length < rects.length) {
      const sprite = this.scene.add
        .tileSprite(camera.x, camera.y, 1, 1, hatchKey(this.style))
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-60);
      this.scene.cameras.main.ignore(sprite);
      const displayKey = (sprite as unknown as { displayTexture: Phaser.Textures.Texture | null })
        .displayTexture?.key;
      if (displayKey) this.displayTextureKeys.push(displayKey);
      this.sprites.push(sprite);
    }

    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const rect = rects[i];
      if (!sprite) continue;
      if (!rect) {
        sprite.setVisible(false).setSize(1, 1);
        if (this.canvasRenderer) {
          (sprite as unknown as { updateCanvas: () => void }).updateCanvas();
        }
        continue;
      }
      const width = Math.max(1, Math.ceil(rect.right - rect.left));
      const height = Math.max(1, Math.ceil(rect.bottom - rect.top));
      const worldLeft =
        camera.scrollX + camera.width / 2 - camera.width / (2 * zoom) + rect.left / zoom;
      const worldTop =
        camera.scrollY + camera.height / 2 - camera.height / (2 * zoom) + rect.top / zoom;
      sprite
        .setPosition(camera.x + rect.left, camera.y + rect.top)
        .setSize(width, height)
        .setTileScale(zoom)
        .setTilePosition(worldLeft, worldTop)
        .setVisible(true);
      if (this.canvasRenderer) {
        (sprite as unknown as { updateCanvas: () => void }).updateCanvas();
      }
    }
  }
}
