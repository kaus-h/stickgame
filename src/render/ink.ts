import type * as Phaser from 'phaser';

/**
 * Pen-and-ink drawing helpers (doc 07: black ink, wobbly contours, crosshatching). All wobble is
 * derived from a seed, never from Math.random, so the drawing is identical every frame and never
 * shimmers.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Deterministic 0..1 noise from an integer-ish input. */
export function hash(n: number): number {
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in -1..1. */
function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i + seed * 101.3) * 2 - 1;
  const b = hash(i + 1 + seed * 101.3) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/** Subdivide a polyline and push points sideways by smooth noise: a hand-drawn line. */
export function wobble(points: readonly Pt[], seed: number, amplitude: number, step: number): Pt[] {
  const out: Pt[] = [];
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Pt;
    const b = points[i + 1] as Pt;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const d = smoothNoise((travelled + len * t) / (step * 2.5), seed) * amplitude;
      out.push({ x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d });
    }
    travelled += len;
  }
  const last = points[points.length - 1];
  if (last) out.push({ ...last });
  return out;
}

/** Stroke a polyline with slight width variation along its length, like pen pressure. */
export function strokeInk(
  g: Phaser.GameObjects.Graphics,
  points: readonly Pt[],
  width: number,
  color: number,
  alpha = 1,
  seed = 0,
): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Pt;
    const b = points[i + 1] as Pt;
    const w = width * (0.82 + 0.36 * hash(i * 0.37 + seed));
    g.lineStyle(w, color, alpha);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  // Round the joints so thick strokes don't show gaps.
  g.fillStyle(color, alpha);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Pt;
    g.fillCircle(p.x, p.y, width * 0.45);
  }
}

/**
 * Parallel hatch lines clipped to any simple polygon (even-odd scanline), drawn slightly wobbly
 * and with ragged ends, like quick pen hatching.
 */
export function hatchPolygon(
  g: Phaser.GameObjects.Graphics,
  poly: readonly Pt[],
  spacing: number,
  angle: number,
  width: number,
  color: number,
  alpha: number,
  seed: number,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rotate into hatch space: hatch lines become horizontal.
  const rot = poly.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  const ys = rot.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let line = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing, line++) {
    const xs: number[] = [];
    for (let i = 0; i < rot.length; i++) {
      const a = rot[i] as Pt;
      const b = rot[(i + 1) % rot.length] as Pt;
      if (a.y <= y === b.y <= y) continue;
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const inset = spacing * 0.6;
      const x0 = (xs[k] as number) + inset * hash(line + seed);
      const x1 = (xs[k + 1] as number) - inset * hash(line + seed + 0.5);
      if (x1 - x0 < spacing) continue;
      const yy = y + (hash(line * 1.7 + seed) - 0.5) * spacing * 0.3;
      const pts = [
        { x: x0 * c - yy * s, y: x0 * s + yy * c },
        { x: x1 * c - yy * s, y: x1 * s + yy * c },
      ];
      strokeInk(
        g,
        wobble(pts, seed + line, spacing * 0.08, spacing * 4),
        width,
        color,
        alpha,
        line,
      );
    }
  }
}

/** A dashed pen line from a to b, dash pattern anchored at `a` so it doesn't crawl. */
export function dashedInk(
  g: Phaser.GameObjects.Graphics,
  a: Pt,
  b: Pt,
  dash: number,
  gap: number,
  width: number,
  color: number,
): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  g.lineStyle(width, color, 1);
  let i = 0;
  for (let d = 0; d < len; d += dash + gap, i++) {
    const e = Math.min(len, d + dash * (0.85 + 0.3 * hash(i)));
    const j = (hash(i + 0.31) - 0.5) * width * 0.6;
    g.lineBetween(
      a.x + ux * d - uy * j,
      a.y + uy * d + ux * j,
      a.x + ux * e - uy * j,
      a.y + uy * e + ux * j,
    );
  }
}
