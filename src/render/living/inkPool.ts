import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { SolidDef } from '../../sim';
import { hash, type Pt } from '../ink';

/**
 * Drawn red ink pools (Living Notebook pillar 2). The body is painted once into the static kit
 * canvas: solid red (lethal must read as a red mass, GMR-56) worked over with darker and lighter
 * ballpoint hatching. The surface lives: a rippling contour, animated on twos, with bubbles that
 * rise and pop into little loops. Presentation only; the collision is the authored polygon.
 */
const RED = '#b8322b';
const RED_DARK = '#7d1a16';
const RED_LIGHT = '#e0645a';
export const POOL_RED = 0xb8322b;
const POOL_RED_DARK = 0x7d1a16;
const POOL_RED_LIGHT = 0xe0645a;
/** The static body starts this far below the surface; the live strip covers the gap. */
export const SURFACE_BAND = 0.05;
/** Ripple height above and below the surface line, in meters. */
const RIPPLE = 0.035;
/** The surface animates on twos: 12 drawings a second, like hand-drawn liquid. */
const SURFACE_FPS = 12;

export interface PoolShape {
  readonly minX: number;
  readonly maxX: number;
  readonly top: number;
  readonly bottom: number;
  readonly seed: number;
}

export function poolShape(solid: SolidDef): PoolShape {
  const xs = solid.points.map((p) => p.x);
  const ys = solid.points.map((p) => p.y);
  let seed = 0;
  for (let i = 0; i < solid.id.length; i++) seed = (seed * 31 + solid.id.charCodeAt(i)) % 7919;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
    seed,
  };
}

/** Paint the pool body into a 2D canvas (world pixels), clipped to the collision polygon. */
export function paintInkPool(c: CanvasRenderingContext2D, solid: SolidDef): void {
  const s = poolShape(solid);
  const x0 = m(s.minX);
  const x1 = m(s.maxX);
  const y0 = m(s.top + SURFACE_BAND);
  const y1 = m(s.bottom);
  if (y1 <= y0) return;
  c.save();
  c.beginPath();
  solid.points.forEach((p, i) => {
    if (i === 0) c.moveTo(m(p.x), m(p.y));
    else c.lineTo(m(p.x), m(p.y));
  });
  c.closePath();
  c.clip();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  c.fillStyle = RED;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.lineCap = 'round';
  // Pass 1: long dark ballpoint diagonals, denser with depth.
  const depth = y1 - y0;
  const stroke = (
    color: string,
    alpha: number,
    width: number,
    spacing: number,
    angle: number,
    from: number,
    seed: number,
  ): void => {
    c.strokeStyle = color;
    c.lineWidth = width;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const span = x1 - x0 + depth * 2;
    let i = 0;
    for (let u = -depth; u < span; u += spacing, i++) {
      const r = hash(i * 0.731 + seed);
      if (r < 0.12) continue; // the pen skips now and then
      const sx = x0 + u;
      const sy = y0 + depth * from + r * spacing;
      const len = depth * (0.6 + 0.8 * hash(i * 1.37 + seed));
      c.globalAlpha = alpha * (0.6 + 0.4 * hash(i * 2.1 + seed));
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(
        sx + dx * len * 0.5 + (r - 0.5) * spacing,
        sy + dy * len * 0.5,
        sx + dx * len,
        sy + dy * len,
      );
      c.stroke();
    }
  };
  stroke(RED_DARK, 0.55, 1.2, 5, 1.05, 0.05, s.seed);
  stroke(RED_DARK, 0.45, 1, 7, 2.0, 0.35, s.seed + 11);
  // Pass 2: light red ballpoint near the surface, like the pen catching light on wet ink.
  stroke(RED_LIGHT, 0.4, 1, 9, 0.55, 0, s.seed + 23);
  // Pass 3: a scribbled dark seam along the bottom.
  c.strokeStyle = RED_DARK;
  c.lineWidth = 1.4;
  c.globalAlpha = 0.6;
  c.beginPath();
  for (let x = x0, k = 0; x < x1; x += 6, k++) {
    const y = y1 - 3 - 4 * hash(k * 0.53 + s.seed);
    if (k === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  c.restore();
}

/** Surface height offset (meters, + is down) at world x and a quantized time. */
export function rippleAt(x: number, t: number, seed: number): number {
  const a = Math.sin(x * 2.3 + t * 2.1 + seed) * 0.55;
  const b = Math.sin(x * 5.1 - t * 3.3 + seed * 1.7) * 0.3;
  const c = (hash(Math.floor(x * 4) + seed + Math.floor(t * SURFACE_FPS) * 0.01) - 0.5) * 0.3;
  return (a + b + c) * RIPPLE;
}

/** Bubbles: each 1.6 m slot of a pool runs its own rise-and-pop cycle. */
const BUBBLE_SLOT = 1.6;
const BUBBLE_PERIOD = 2.6;
const BUBBLE_RISE = 1.1;

/** Live part of every visible pool: the surface strip, its pen contour, and bubbles. */
export function drawPoolSurfaces(
  g: Phaser.GameObjects.Graphics,
  pools: readonly PoolShape[],
  view: { x: number; y: number; width: number; height: number },
  seconds: number,
  calm: boolean,
): void {
  const t = calm ? 0 : Math.floor(seconds * SURFACE_FPS) / SURFACE_FPS;
  const vx0 = view.x / m(1) - 1;
  const vx1 = (view.x + view.width) / m(1) + 1;
  for (const p of pools) {
    const a = Math.max(p.minX, vx0);
    const b = Math.min(p.maxX, vx1);
    if (b <= a) continue;
    if (m(p.bottom) < view.y || m(p.top) > view.y + view.height) continue;
    const step = 0.12;
    const wave: Pt[] = [];
    for (let x = a; x <= b + 1e-9; x += step) {
      const xx = Math.min(x, b);
      wave.push({ x: m(xx), y: m(p.top + RIPPLE + rippleAt(xx, t, p.seed)) });
    }
    // Fill from the ripple down to the static body, so the silhouette really moves.
    const strip: Pt[] = [
      ...wave,
      { x: m(b), y: m(p.top + SURFACE_BAND) + 1 },
      { x: m(a), y: m(p.top + SURFACE_BAND) + 1 },
    ];
    g.fillStyle(POOL_RED, 1).fillPoints(
      strip as unknown as Parameters<Phaser.GameObjects.Graphics['fillPoints']>[0],
      true,
    );
    // Contour: a dark pen line with a light catch-light pass just under it.
    g.lineStyle(2.2, POOL_RED_DARK, 0.9);
    g.strokePoints(wave as unknown as Parameters<Phaser.GameObjects.Graphics['strokePoints']>[0]);
    g.lineStyle(1, POOL_RED_LIGHT, 0.7);
    g.strokePoints(
      wave.map((q) => ({ x: q.x, y: q.y + 3 })) as unknown as Parameters<
        Phaser.GameObjects.Graphics['strokePoints']
      >[0],
    );
    if (calm) continue;
    // Bubbles.
    const first = Math.floor(a / BUBBLE_SLOT);
    for (let k = first; k * BUBBLE_SLOT < b; k++) {
      const phase = hash(k * 0.917 + p.seed) * BUBBLE_PERIOD;
      const cycle = (seconds + phase) % BUBBLE_PERIOD;
      const x = (k + 0.2 + 0.6 * hash(k * 1.31 + p.seed)) * BUBBLE_SLOT;
      if (x < a || x > b) continue;
      const depth = Math.min(1.2, (p.bottom - p.top) * 0.7);
      if (cycle < BUBBLE_RISE) {
        const u = cycle / BUBBLE_RISE;
        const y = p.top + depth * (1 - u) + RIPPLE;
        const r = m(0.04 + 0.05 * u);
        g.lineStyle(1.3, POOL_RED_LIGHT, 0.85).strokeCircle(m(x), m(y), r);
      } else if (cycle < BUBBLE_RISE + 0.18) {
        // Pop: three tiny ink ticks flick up off the surface.
        const u = (cycle - BUBBLE_RISE) / 0.18;
        const y = m(p.top + RIPPLE * 0.5);
        g.lineStyle(1.4, POOL_RED_DARK, 1 - u);
        for (const dir of [-0.9, 0, 0.9]) {
          const len = m(0.06 + 0.1 * u);
          g.lineBetween(
            m(x) + dir * len * 0.6,
            y - len * 0.4,
            m(x) + dir * len * 1.2,
            y - len * (1 - Math.abs(dir) * 0.4),
          );
        }
      }
    }
  }
}
