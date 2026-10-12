import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import { PAGE, RULE_SPACING_M } from '../page/NotebookPage';
import { hash, strokeInk, wobble, type Pt } from '../ink';
import { listenPresentationSkip } from './presentationSkip';

export const PAGE_TURN_SECONDS = 0.7;
export const PAGE_FADE_SECONDS = 0.15;
const BACK = 0xe4e0d6;
const EDGE = 0x6b675f;

/** Slow thumb lift in the first quarter, quick sweep, then a soft settle. */
export function pageTurnEase(progress: number): number {
  const u = Math.min(1, Math.max(0, progress));
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
}

/** Clip a convex sheet to the lifted side of a straight crease (normal dot point >= offset). */
function clipSheet(sheet: readonly Pt[], normal: Pt, offset: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < sheet.length; i++) {
    const a = sheet[i] as Pt;
    const b = sheet[(i + 1) % sheet.length] as Pt;
    const da = a.x * normal.x + a.y * normal.y - offset;
    const db = b.x * normal.x + b.y * normal.y - offset;
    if (da >= 0) out.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  // Deduplicate corner intersections (the fold begins at a single point).
  return out.filter(
    (p, i) => !out.slice(0, i).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-7),
  );
}

export function reflectInFold(p: Pt, normal: Pt, offset: number): Pt {
  const distance = p.x * normal.x + p.y * normal.y - offset;
  return { x: p.x - 2 * normal.x * distance, y: p.y - 2 * normal.y * distance };
}

/** Screen-space geometry: the lifted corner reflects over a crease travelling upper-left. */
export function pageTurnGeometry(width: number, height: number, progress: number) {
  const sheet = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const normal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const offset = (width + height) * Math.SQRT1_2 * (1 - Math.min(1, Math.max(0, progress)));
  const revealed = clipSheet(sheet, normal, offset);
  const fold = revealed.filter((p) => Math.abs(p.x * normal.x + p.y * normal.y - offset) < 1e-6);
  return {
    normal,
    offset,
    revealed,
    fold,
    back: revealed.map((p) => reflectInFold(p, normal, offset)),
  };
}

/** Intersect a horizontal ruling/fibre with the lifted portion of the original rectangle. */
function liftedLine(a: Pt, b: Pt, normal: Pt, offset: number): [Pt, Pt] | null {
  const da = a.x * normal.x + a.y * normal.y - offset;
  const db = b.x * normal.x + b.y * normal.y - offset;
  if (da < 0 && db < 0) return null;
  if (da >= 0 && db >= 0) return [a, b];
  const t = da / (da - db);
  const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return da < 0 ? [cut, b] : [a, cut];
}

/** Paper, never glossy shading: all objects are Graphics, with no generated textures to leak. */
export class PageTurn {
  private readonly g: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private covered = false;
  private done: (() => void) | null = null;
  private unlisten: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: boolean,
    private readonly highContrast: boolean,
  ) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(95);
  }

  start(done: () => void): void {
    if (this.done) return;
    this.elapsed = 0;
    this.covered = true;
    this.done = done;
    this.unlisten = listenPresentationSkip(() => {
      this.skip();
    });
    this.draw(this.scene.scale.width, this.scene.scale.height);
  }

  presentation(): { active: boolean; progress: number } {
    const u = Math.min(
      1,
      this.elapsed / (this.reducedMotion ? PAGE_FADE_SECONDS : PAGE_TURN_SECONDS),
    );
    return {
      active: this.done !== null,
      progress: this.covered ? (this.reducedMotion ? u : pageTurnEase(u)) : 0,
    };
  }

  update(dt: number, width: number, height: number): void {
    if (!this.covered) return;
    if (this.done) this.elapsed += Math.max(0, dt);
    if (this.done && this.elapsed >= (this.reducedMotion ? PAGE_FADE_SECONDS : PAGE_TURN_SECONDS))
      this.skip();
    this.draw(width, height);
  }

  /** Finish just the current stage; retain the fresh sheet beneath results until Retry. */
  skip(): void {
    const done = this.done;
    if (!done) return;
    this.elapsed = this.reducedMotion ? PAGE_FADE_SECONDS : PAGE_TURN_SECONDS;
    this.done = null;
    this.unlisten?.();
    this.unlisten = null;
    this.draw(this.scene.scale.width, this.scene.scale.height);
    done();
  }

  /** Reset/reload cancels an obsolete results callback; a death never starts a turn. */
  clear(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.done = null;
    this.covered = false;
    this.elapsed = 0;
    this.g.clear();
  }

  destroy(): void {
    this.clear();
    this.g.destroy();
  }

  private fill(poly: readonly Pt[], colour: number, alpha = 1): void {
    if (poly.length < 3) return;
    this.g.fillStyle(colour, alpha).beginPath();
    poly.forEach((p, i) => (i === 0 ? this.g.moveTo(p.x, p.y) : this.g.lineTo(p.x, p.y)));
    this.g.closePath().fillPath();
  }

  private draw(width: number, height: number): void {
    const g = this.g;
    g.clear();
    if (!this.covered) return;
    const { progress: p } = this.presentation();
    const geo = pageTurnGeometry(width, height, this.reducedMotion ? 1 : p);
    const alpha = this.reducedMotion ? p : 1;
    this.fill(geo.revealed, PAGE.paper, alpha);
    const spacing = m(RULE_SPACING_M);
    // NotebookPage's same paper palette, ruling spacing and fine fibre strokes. Drawing clipped
    // fills rather than TileSprites avoids the private display textures described in drawIn.
    for (let y = 0.5; y < height; y += spacing) {
      const line = liftedLine({ x: 0, y }, { x: width, y }, geo.normal, geo.offset);
      if (line)
        g.lineStyle(1.2, PAGE.rule, 0.55 * alpha).lineBetween(
          line[0].x,
          line[0].y,
          line[1].x,
          line[1].y,
        );
    }
    this.fibres(width, height, geo.normal, geo.offset, false, alpha);
    if (this.reducedMotion || p <= 0 || p >= 1 || geo.fold.length < 2) return;
    const a = geo.fold[0] as Pt,
      b = geo.fold[1] as Pt;
    // Soft contact shadow on the page underneath, four matte pencil-grey bands.
    for (const band of [24, 16, 9, 3]) {
      const n = geo.normal;
      this.fill(
        [
          a,
          b,
          { x: b.x + n.x * band, y: b.y + n.y * band },
          { x: a.x + n.x * band, y: a.y + n.y * band },
        ],
        EDGE,
        0.045,
      );
    }
    this.fill(geo.back, BACK);
    for (let y = 0.5; y < height; y += spacing) {
      const line = liftedLine({ x: 0, y }, { x: width, y }, geo.normal, geo.offset);
      if (!line) continue;
      const ra = reflectInFold(line[0], geo.normal, geo.offset),
        rb = reflectInFold(line[1], geo.normal, geo.offset);
      g.lineStyle(1.2, PAGE.rule, 0.25).lineBetween(ra.x, ra.y, rb.x, rb.y);
    }
    this.fibres(width, height, geo.normal, geo.offset, true, 1);
    // Light free edges plus a single straight, slightly imperfect pencil crease.
    const outline = [...geo.back, geo.back[0] as Pt];
    strokeInk(g, wobble(outline, 31, 0.35, 14), 0.8, EDGE, 0.35, 31);
    strokeInk(
      g,
      wobble([a, b], 17, 0.4, 12),
      this.highContrast ? 2 : 1.2,
      this.highContrast ? PAGE.ink : EDGE,
      0.95,
      17,
    );
  }

  private fibres(
    width: number,
    height: number,
    normal: Pt,
    offset: number,
    back: boolean,
    alpha: number,
  ): void {
    const count = Math.ceil((width * height) / 700);
    this.g.lineStyle(0.7, PAGE.fibre, 0.24 * alpha);
    for (let i = 0; i < count; i++) {
      const x = hash(i * 12.9898) * width,
        y = hash(i * 78.233 + 5) * height;
      const line = liftedLine(
        { x, y },
        { x: Math.min(width, x + 1.5 + hash(i * 4.1) * 5), y: y + (hash(i * 9.3) - 0.5) * 2 },
        normal,
        offset,
      );
      if (!line) continue;
      const [a, b] = back ? (line.map((p) => reflectInFold(p, normal, offset)) as [Pt, Pt]) : line;
      this.g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}
