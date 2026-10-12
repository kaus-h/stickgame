import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef } from '../../sim';
import { hash, strokeInk, wobble, type Pt } from '../ink';

/** Paper-and-ink palette (style bible §2). */
export const PAGE = {
  paper: 0xf3efe6,
  fibre: 0xd8cfbd,
  rule: 0x9ec2df,
  margin: 0xe28a8a,
  ink: 0x16161a,
  pencil: 0x8a8a8a,
  hole: 0xcfc7b6,
  wire: 0x4a4a50,
} as const;

/** College ruling every 0.5 world meters: world-anchored, so it doubles as a height ruler. */
export const RULE_SPACING_M = 0.5;
export const TILE = 256;
export const PAPER_KEY = 'notebook-paper';

const css = (c: number, a = 1): string =>
  `rgba(${String((c >> 16) & 255)},${String((c >> 8) & 255)},${String(c & 255)},${String(a)})`;

/**
 * One 256×256 paper tile with fibre specks, faint blotches and the ruled lines baked in. The tile
 * height is a whole number of rule spacings, so a world-anchored TileSprite gives continuous ruling.
 */
export function ensurePaperTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PAPER_KEY)) return;
  const tex = scene.textures.createCanvas(PAPER_KEY, TILE, TILE);
  if (!tex) return;
  const c = tex.getContext();
  c.fillStyle = css(PAGE.paper);
  c.fillRect(0, 0, TILE, TILE);
  // Soft blotches: paper is never perfectly flat.
  for (let i = 0; i < 18; i++) {
    const x = hash(i * 3.1) * TILE;
    const y = hash(i * 7.7 + 1) * TILE;
    const r = 18 + hash(i * 1.9 + 2) * 40;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(PAGE.fibre, 0.08));
    g.addColorStop(1, css(PAGE.fibre, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibres: short, faint, mostly horizontal strokes.
  c.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 12.9898) * TILE;
    const y = hash(i * 78.233 + 5) * TILE;
    const len = 1.5 + hash(i * 4.1) * 5;
    const ang = (hash(i * 9.3) - 0.5) * 0.9;
    c.strokeStyle = css(PAGE.fibre, 0.18 + hash(i * 2.7) * 0.25);
    c.lineWidth = 0.6 + hash(i * 5.3) * 0.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
  // Ruled lines.
  const spacing = m(RULE_SPACING_M);
  c.strokeStyle = css(PAGE.rule, 0.55);
  c.lineWidth = 1.2;
  for (let y = 0; y < TILE; y += spacing) {
    c.beginPath();
    c.moveTo(0, y + 0.5);
    c.lineTo(TILE, y + 0.5);
    c.stroke();
  }
  tex.refresh();
}

/** World-locked paper under the whole level (one quad, no per-frame drawing). */
export function addPaper(
  scene: Phaser.Scene,
  level: LevelDef,
  pad = 30,
): Phaser.GameObjects.TileSprite {
  ensurePaperTexture(scene);
  const b = level.bounds;
  // Snap the origin to the tile grid so texture coordinates equal world pixels.
  const x0 = Math.floor(m(b.minX - pad) / TILE) * TILE;
  const y0 = Math.floor(m(b.minY - pad) / TILE) * TILE;
  const w = Math.ceil(m(b.maxX + pad) - x0);
  const h = Math.ceil(m(b.maxY + pad) - y0);
  const paper = scene.add.tileSprite(x0, y0, w, h, PAPER_KEY).setOrigin(0, 0).setDepth(-100);
  // Phaser's Canvas TileSprite releases its canvas on destroy but leaves its private
  // display texture registered. Remove only that instance's texture, never the shared tile.
  // The runtime member is omitted from Phaser 4's TileSprite declarations.
  const displayKey = (paper as unknown as { displayTexture: Phaser.Textures.Texture | null })
    .displayTexture?.key;
  scene.events.once('shutdown', () => {
    if (displayKey && scene.textures.exists(displayKey)) scene.textures.remove(displayKey);
  });
  return paper;
}

/**
 * Screen-fixed page frame (GMR-98: paper and ruling are world-locked, margin and binding frame the
 * view): a spiral wire binding with punched holes down the left edge and the red margin line.
 */
export function drawFrame(g: Phaser.GameObjects.Graphics, h: number): void {
  g.clear();
  const holeX = 26;
  const marginX = 64;
  // Margin.
  g.lineStyle(2, PAGE.margin, 0.75).lineBetween(marginX, 0, marginX, h);
  // Punched holes and wire coils every ~34 px.
  for (let y = 14, k = 0; y < h; y += 34, k++) {
    g.fillStyle(PAGE.hole, 1).fillCircle(holeX, y, 6.5);
    g.lineStyle(1, PAGE.pencil, 0.6).strokeCircle(holeX, y, 6.5);
    // The coil loops from behind the page, through the hole, over the edge.
    const wob = (hash(k * 1.7) - 0.5) * 1.5;
    g.lineStyle(3.2, PAGE.wire, 1);
    g.beginPath();
    g.arc(holeX - 9 + wob, y - 2, 11, -0.35 * Math.PI, 0.55 * Math.PI, false);
    g.strokePath();
    g.lineStyle(1.2, 0xb8b8c0, 0.9);
    g.beginPath();
    g.arc(holeX - 9 + wob, y - 3, 10, -0.3 * Math.PI, 0.1 * Math.PI, false);
    g.strokePath();
  }
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Faint pencil doodles behind the play space: clouds high up, a sketched horizon low down, a few
 * birds. Deterministic per level, and kept clear of every solid, anchor, spawn and exit so they
 * never compete with gameplay (doc 07 §13 hierarchy).
 */
export function drawDoodles(g: Phaser.GameObjects.Graphics, level: LevelDef): void {
  const keepOut: Box[] = [
    ...level.solids.map((s) => {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      return {
        x0: Math.min(...xs) - 1,
        y0: Math.min(...ys) - 1,
        x1: Math.max(...xs) + 1,
        y1: Math.max(...ys) + 1,
      };
    }),
    ...level.anchors.map((a) => ({
      x0: a.position.x - 2,
      y0: a.position.y - 2,
      x1: a.position.x + 2,
      y1: a.position.y + 2,
    })),
    { x0: level.spawn.x - 2, y0: level.spawn.y - 2, x1: level.spawn.x + 2, y1: level.spawn.y + 2 },
  ];
  if (level.exit) {
    keepOut.push({
      x0: level.exit.min.x - 1,
      y0: level.exit.min.y - 1,
      x1: level.exit.max.x + 1,
      y1: level.exit.max.y + 1,
    });
  }
  const seed = level.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const b = level.bounds;

  // Clouds along the top of the level.
  for (let i = 0, x = b.minX + 4; x < b.maxX - 4; i++, x += 9 + hash(seed + i) * 8) {
    // In the band the camera shows above the floor (about 9 to 13 m above the bottom bound).
    const y = Math.max(b.minY + 1.5, b.maxY - 13) + hash(seed * 3 + i) * 3;
    const w = 3 + hash(seed + i * 5) * 2.5;
    const box = { x0: x - w / 2, y0: y - 1, x1: x + w / 2, y1: y + 0.6 };
    if (keepOut.some((k) => overlaps(k, box))) continue;
    cloud(g, x, y, w, seed + i);
  }
  // Birds: two or three pencil ticks.
  for (let i = 0; i < 6; i++) {
    const x = b.minX + 3 + hash(seed * 11 + i) * (b.maxX - b.minX - 6);
    const y = Math.max(b.minY + 1, b.maxY - 13) + hash(seed * 13 + i) * 4;
    const box = { x0: x - 0.4, y0: y - 0.3, x1: x + 0.4, y1: y + 0.3 };
    if (keepOut.some((k) => overlaps(k, box))) continue;
    g.lineStyle(1.3, PAGE.pencil, 0.45);
    const s = 0.18 + hash(seed + i * 3) * 0.1;
    g.lineBetween(m(x - s), m(y - s * 0.4), m(x), m(y));
    g.lineBetween(m(x), m(y), m(x + s), m(y - s * 0.5));
  }
}

function cloud(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  seed: number,
): void {
  // A row of overlapping bumps over a flat base, drawn as a wobbly pencil line.
  const pts: Pt[] = [];
  const bumps = 3 + Math.floor(hash(seed) * 3);
  const left = cx - w / 2;
  for (let i = 0; i < bumps; i++) {
    const bx = left + ((i + 0.5) / bumps) * w;
    const r = (w / bumps) * (0.55 + hash(seed + i) * 0.35);
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      pts.push({ x: m(bx + Math.cos(a) * r), y: m(cy + Math.sin(a) * r * 0.8) });
    }
  }
  strokeInk(g, wobble(pts, seed, m(0.02), m(0.25)), 1.4, PAGE.pencil, 0.4, seed);
  g.lineStyle(1.2, PAGE.pencil, 0.3).lineBetween(m(left - 0.3), m(cy), m(left + w + 0.3), m(cy));
  // A little underside hatching.
  g.lineStyle(1, PAGE.pencil, 0.22);
  for (let x = left + 0.2; x < left + w - 0.2; x += 0.22)
    g.lineBetween(m(x), m(cy - 0.05), m(x + 0.18), m(cy - 0.32));
}

/**
 * Bake a static Graphics into textures in world-space tiles, then destroy it, so the page costs a
 * few quads per frame instead of re-submitting thousands of hatch strokes (GMR-98 low-end target).
 */
export function bakeGraphics(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  area: { x: number; y: number; w: number; h: number },
  depth: number,
  tile = 1024,
): Phaser.GameObjects.RenderTexture[] {
  const out: Phaser.GameObjects.RenderTexture[] = [];
  for (let ty = area.y; ty < area.y + area.h; ty += tile) {
    for (let tx = area.x; tx < area.x + area.w; tx += tile) {
      const w = Math.min(tile, area.x + area.w - tx);
      const h = Math.min(tile, area.y + area.h - ty);
      const rt = scene.add.renderTexture(tx, ty, w, h).setOrigin(0, 0).setDepth(depth);
      rt.draw(g, -tx, -ty);
      rt.render();
      out.push(rt);
    }
  }
  g.destroy();
  return out;
}
