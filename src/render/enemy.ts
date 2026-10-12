import type * as Phaser from 'phaser';
import { metersToPixels as m, type Vec2 } from '../core';
import { hash, hatchPolygon, strokeInk, wobble, type Pt } from './ink';

const INK = 0x16161a;
const PAPER = 0xf3efe6;
const RED_PEN = 0xc5302a;
/** Red marks (the dangerous sides) start this far down the body; the top band stays ink only. */
export const SAFE_TOP_BAND = 0.32;

/** Base pen width for a goon of this pixel height. */
export function patrollerLine(heightPx: number): number {
  return Math.max(2, heightPx * 0.055);
}
/**
 * Widest stroke half-width in units of `line`: the back is 1.5 lines, strokeInk varies width up
 * to 1.18x, so 0.885 lines from its centreline. Every mark sits at least this far inside.
 */
export const STROKE_REACH = 0.9;

/** A pen line segment in pixels. */
export interface Seg {
  readonly a: Pt;
  readonly b: Pt;
}

/** Everything the goon drawing uses, in pixels, all inside the authored collision box. */
export interface PatrollerMarks {
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Base stroke width in pixels; no stroke is wider than line * 2 * STROKE_REACH. */
  readonly line: number;
  /** Closed wobbly body contour (feet hang below it, still inside the box). */
  readonly body: readonly Pt[];
  /** The flat back the player lands on: a heavier ink stroke along the top. */
  readonly back: readonly Pt[];
  /** Two narrow paper slits. */
  readonly eyes: readonly Seg[];
  readonly bristles: readonly Seg[];
  /** Red ballpoint: side thorns. Never in the top band. */
  readonly red: readonly Pt[][];
  readonly legs: readonly Seg[];
}

/** Stable per-goon seed from its id, so each critter is drawn a little differently. */
export function goonSeed(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
}

/**
 * The hand-drawn ink critter (owner feedback 2026-10-12: goons look hand drawn, not slime
 * boxes). Pure geometry so tests can check it never leaves the collision box. `stride` is the
 * distance walked in meters: the legs step with movement, so a still goon stands still and
 * nothing shimmers.
 */
export function patrollerMarks(
  position: Vec2,
  size: Vec2,
  facing: number,
  seed: number,
  stride: number,
): PatrollerMarks {
  const bw = m(size.x);
  const bh = m(size.y);
  const line = patrollerLine(bh);
  // Build inside the box shrunk by the widest stroke's half-width, so rendered ink (not just
  // stroke centrelines) never leaves collision.
  const pad = line * STROKE_REACH;
  const w = bw - 2 * pad;
  const h = bh - 2 * pad;
  const x = m(position.x) - w / 2;
  const y = m(position.y) - h / 2;
  const legH = h * 0.14;
  const bodyB = y + h - legH;
  const r = Math.min(w, h) * 0.22;
  const wob = Math.min(1.4, h * 0.02);
  const inset = wob + 1; // keep the wobble inside the box

  // Body: flat back (it is the safe landing surface), rounded belly corners.
  const L = x + inset;
  const R = x + w - inset;
  const T = y + inset;
  const B = bodyB;
  const arc = (cx: number, cy: number, from: number, to: number): Pt[] =>
    Array.from({ length: 6 }, (_, i) => {
      const t = from + ((to - from) * i) / 5;
      return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r };
    });
  const rTop = r * 0.45;
  const outline: Pt[] = [
    { x: L + rTop, y: T },
    { x: R - rTop, y: T },
    { x: R, y: T + rTop },
    ...arc(R - r, B - r, 0, Math.PI / 2),
    ...arc(L + r, B - r, Math.PI / 2, Math.PI),
    { x: L, y: T + rTop },
    { x: L + rTop, y: T },
  ];
  const body = wobble(outline, seed, wob, Math.max(4, w / 14)).map((p) => ({
    x: Math.min(x + w - 0.5, Math.max(x + 0.5, p.x)),
    y: Math.min(B, Math.max(y + 0.5, p.y)),
  }));
  const back = wobble(
    [
      { x: L + rTop, y: T + 0.5 },
      { x: R - rTop, y: T + 0.5 },
    ],
    seed + 3,
    wob * 0.6,
    Math.max(4, w / 10),
  );

  // Eyes: two narrow paper slits cut into the dark hatching, slanted into a frown and set
  // toward the way it walks. No pupils, no cartoon whites (owner feedback 2026-10-12).
  const eyeY = y + h * 0.36;
  const slit = Math.min(w * 0.09, h * 0.1);
  const eyes: Seg[] = [-1, 1].map((side) => {
    const cx = x + w * (0.5 + side * 0.13 + facing * 0.08);
    return {
      a: { x: cx - side * slit * 0.2 + side * slit, y: eyeY - slit * 0.35 },
      b: { x: cx - side * slit * 0.9, y: eyeY + slit * 0.25 },
    };
  });

  // Bristles: short scratchy strokes on the flanks and belly, ending at the collision edge.
  const bristles: Seg[] = [];
  const bl = Math.min(w, h) * 0.12;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x + 0.5 : x + w - 0.5;
    for (let k = 0; k < 6; k++) {
      const by = y + h * (0.12 + k * 0.12);
      if (by > bodyB - 2) break;
      const j = (hash(k + seed + side) - 0.5) * bl * 0.6;
      bristles.push({
        a: { x: edge - side * bl, y: by + j },
        b: { x: edge, y: by + j - bl * 0.3 },
      });
    }
  }
  for (let k = 0; k < 7; k++) {
    const bx = x + w * (0.14 + k * 0.12);
    bristles.push({
      a: { x: bx, y: bodyB - bl },
      b: { x: bx + (hash(k * 1.3 + seed) - 0.5) * bl, y: bodyB },
    });
  }

  // Red ballpoint: three thorns down each side, all below the top band.
  const red: Pt[][] = [];
  const thorn = Math.min(w * 0.07, h * 0.09);
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x + 1 : x + w - 1;
    for (let k = 0; k < 3; k++) {
      const ty = y + h * (SAFE_TOP_BAND + 0.08 + k * 0.17);
      if (ty + thorn > bodyB) break;
      red.push([
        { x: edge - side * thorn * 1.3, y: ty - thorn * 0.7 },
        { x: edge, y: ty },
        { x: edge - side * thorn * 1.3, y: ty + thorn * 0.7 },
      ]);
    }
  }

  // Four stubby legs that step with distance walked.
  const legs: Seg[] = [];
  const phase = (stride / 0.35) * Math.PI;
  for (let k = 0; k < 4; k++) {
    const lx = x + w * (0.2 + k * 0.2);
    const swing = Math.sin(phase + (k % 2) * Math.PI) * w * 0.035;
    legs.push({
      a: { x: lx, y: bodyB - 1 },
      b: { x: Math.min(x + w - 1, Math.max(x + 1, lx + swing)), y: y + h - 1 },
    });
  }
  return {
    box: { x: x - pad, y: y - pad, w: bw, h: bh },
    line,
    body,
    back,
    eyes,
    bristles,
    red,
    legs,
  };
}

/** Draw the critter. Ink everywhere except red on the parts that kill. */
export function drawPatroller(
  g: Phaser.GameObjects.Graphics,
  position: Vec2,
  size: Vec2,
  facing: number,
  seed: number,
  stride: number,
): void {
  const k = patrollerMarks(position, size, facing, seed, stride);
  const { line } = k;
  for (const leg of k.legs) strokeInk(g, [leg.a, leg.b], line * 0.9, INK, 1, seed);
  g.fillStyle(PAPER, 1).fillPoints(
    k.body.map((p) => ({ x: p.x, y: p.y })) as unknown as Parameters<
      Phaser.GameObjects.Graphics['fillPoints']
    >[0],
    true,
  );
  // A dark, scribbled mass: two passes of cross-hatching, denser toward the belly.
  const spacing = Math.max(2.2, k.box.h * 0.05);
  hatchPolygon(g, k.body, spacing, 0.8, 1, INK, 0.75, seed);
  hatchPolygon(g, k.body, spacing * 1.3, -0.75, 1, INK, 0.6, seed + 9);
  const belly = k.box.y + k.box.h * 0.6;
  hatchPolygon(
    g,
    k.body.map((p) => ({ x: p.x, y: Math.max(p.y, belly) })),
    spacing * 0.8,
    0.1,
    1,
    INK,
    0.7,
    seed + 17,
  );
  strokeInk(g, k.body, line, INK, 1, seed);
  for (const b of k.bristles) strokeInk(g, [b.a, b.b], line * 0.55, INK, 0.9, seed + 3);
  // The flat back reads as the place to land: a clean paper strip under one heavy ink line.
  strokeInk(
    g,
    k.back.map((p) => ({ x: p.x, y: p.y + line * 1.2 })),
    line * 1.1,
    PAPER,
    1,
    seed + 6,
  );
  strokeInk(g, k.back, line * 1.5, INK, 1, seed + 2);
  for (const e of k.eyes) strokeInk(g, [e.a, e.b], line * 1.1, PAPER, 1, seed + 4);
  for (const mark of k.red) strokeInk(g, mark, line * 0.8, RED_PEN, 1, seed + 5);
}
