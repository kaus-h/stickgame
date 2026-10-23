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
/** The wash under the ballpoint colouring: lighter than the strokes so they read on top. */
const RED = '#d4534a';
const RED_DARK = '#7d1a16';
const RED_LIGHT = '#e0645a';
/** Pooled ink at depth. Kept at r >= 125 so the whole body still classifies as lethal red. */
const RED_DEEP = '#a92b23';
export const POOL_RED = 0xb8322b;
const POOL_RED_DARK = 0x7d1a16;
const POOL_RED_LIGHT = 0xe0645a;
/** The static body starts this far below the surface; the live strip covers the gap. */
export const SURFACE_BAND = 0.05;
/** Ripple height above and below the surface line, in meters. */
const RIPPLE = 0.045;
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

/** Stacked pools touch within this many meters (a pool sitting in the red floor). */
const STACK_EPS = 0.05;

/** The span (meters) where `upper` rests on `lower`, or null if they don't touch. */
function touching(upper: PoolShape, lower: PoolShape): [number, number] | null {
  if (upper === lower || Math.abs(upper.bottom - lower.top) > STACK_EPS) return null;
  const a = Math.max(upper.minX, lower.minX),
    b = Math.min(upper.maxX, lower.maxX);
  return b > a ? [a, b] : null;
}

/**
 * Spans (meters) of `p`'s top edge that lie under another pool resting on it. There the two read
 * as one body of ink: no surface, no catch-light, no seam.
 */
export function coveredSpans(
  p: PoolShape,
  pools: readonly PoolShape[],
): readonly (readonly [number, number])[] {
  return pools.flatMap((q) => {
    const span = q.top < p.top ? touching(q, p) : null;
    return span ? [span] : [];
  });
}

const inSpans = (x: number, spans: readonly (readonly [number, number])[]): boolean =>
  spans.some(([a, b]) => x >= a && x <= b);

/**
 * Paint the pool body into a 2D canvas (world pixels), clipped to the collision polygon. `pools`
 * is every pool in the level, so a pool resting in another (1-1's basins in the red floor) joins
 * it as one body: both shade from the upper surface down to the bottom of the stack, with no
 * surface line, seam or tonal step where they meet.
 */
export function paintInkPool(
  c: CanvasRenderingContext2D,
  solid: SolidDef,
  pools: readonly SolidDef[] = [],
): void {
  const s = poolShape(solid);
  const shapes = pools.map(poolShape);
  const restsOn = (p: PoolShape): PoolShape[] => shapes.filter((q) => touching(p, q));
  const deepest = (p: PoolShape): number => Math.max(p.bottom, ...restsOn(p).map((q) => q.bottom));
  const below = restsOn(s).flatMap((q) => {
    const span = touching(s, q);
    return span ? [span] : [];
  });
  const y0 = m(s.top + SURFACE_BAND);
  const y1 = m(s.bottom);
  if (y1 <= y0) return;
  const outline = (): void => {
    c.beginPath();
    solid.points.forEach((p, i) => {
      if (i === 0) c.moveTo(m(p.x), m(p.y));
      else c.lineTo(m(p.x), m(p.y));
    });
    c.closePath();
  };
  // Columns: open stretches shade from this pool's own surface; covered ones continue the body of
  // the pool resting on them.
  const columns: { a: number; b: number; top: number; bottom: number; covered: boolean }[] = [];
  const cover = shapes
    .filter((q) => q.top < s.top && touching(q, s))
    .sort((p, q) => p.minX - q.minX);
  let x = s.minX;
  for (const q of cover) {
    const a = Math.max(x, q.minX),
      b = Math.min(s.maxX, q.maxX);
    if (b <= a) continue;
    if (a > x) columns.push({ a: x, b: a, top: s.top, bottom: deepest(s), covered: false });
    columns.push({ a, b, top: q.top, bottom: Math.max(deepest(q), s.bottom), covered: true });
    x = b;
  }
  if (x < s.maxX) columns.push({ a: x, b: s.maxX, top: s.top, bottom: deepest(s), covered: false });
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const col of columns) {
    c.save();
    if (col.covered) {
      // Unclipped by the outline and two pixels proud of it: two anti-aliased clip edges on one
      // fractional row would otherwise leave a pale hairline through the joined ink.
      c.beginPath();
      c.rect(m(col.a), m(s.top) - 2, m(col.b - col.a), y1 - m(s.top) + 2);
      c.clip();
    } else {
      outline();
      c.clip();
      c.beginPath();
      c.rect(m(col.a), y0, m(col.b - col.a), y1 - y0);
      c.clip();
    }
    paintBody(
      c,
      m(col.a),
      m(col.b),
      m(col.top + SURFACE_BAND),
      m(col.bottom),
      m(s.top) - 2,
      s.seed,
    );
    c.restore();
  }
  // A scribbled dark seam along the bottom, except where the ink runs on into a pool below.
  c.save();
  outline();
  c.clip();
  c.strokeStyle = RED_DARK;
  c.lineWidth = 1.4;
  c.globalAlpha = 0.6;
  c.beginPath();
  let pen = false;
  for (let px = m(s.minX), k = 0; px < m(s.maxX); px += 6, k++) {
    if (inSpans(px / m(1), below)) {
      pen = false;
      continue;
    }
    const py = y1 - 3 - 4 * hash(k * 0.53 + s.seed);
    if (!pen) c.moveTo(px, py);
    else c.lineTo(px, py);
    pen = true;
  }
  c.stroke();
  c.restore();
}

/**
 * The ink itself between x0 and x1, shaded from the surface at y0 down to y1 (world pixels; the
 * caller clips). Rows above `from` are never visible, so the colouring starts just above them.
 */
function paintBody(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  from: number,
  seed: number,
): void {
  // Ink pools deeper toward the bottom: bright where the surface catches light, dark below.
  const depth = y1 - y0;
  const fill = c.createLinearGradient(0, y0, 0, y1);
  // A lighter red wash under the colouring, so the ballpoint strokes read as drawn ink on paper
  // rather than vanishing into a painted slab (owner playtest 2026-10-12: polish).
  fill.addColorStop(0, RED);
  fill.addColorStop(Math.min(0.9, m(0.5) / depth), '#c8443b');
  fill.addColorStop(1, RED_DEEP);
  c.fillStyle = fill;
  const top = Math.min(y0, from);
  c.fillRect(x0, top, x1 - x0, y1 - top);
  // Coloured in with a red ballpoint: overlapping patches of tight back-and-forth strokes, each
  // patch at its own slant, like a hand filling a shape. This is what makes the pool read as ink.
  const patchW = 46;
  const patchH = Math.min(depth, 34);
  const rowStep = patchH * 0.7;
  const skipRows = Math.max(0, Math.floor((from - patchH - (y0 - 6)) / rowStep));
  let k = 0;
  for (let py = y0 - 6 + skipRows * rowStep; py < y1; py += rowStep) {
    for (let px = x0 - patchW * 0.5; px < x1 + patchW * 0.5; px += patchW * 0.62, k++) {
      const r = hash(k * 0.613 + seed);
      const angle = 1.15 + (r - 0.5) * 0.7; // mostly steep strokes, leaning right
      const ux = Math.cos(angle + Math.PI / 2);
      const uy = Math.sin(angle + Math.PI / 2);
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      const cx = px + (hash(k * 1.91 + seed) - 0.5) * 10;
      const cy = py + patchH / 2;
      const half = patchH * (0.55 + 0.25 * hash(k * 2.7 + seed));
      const deep = Math.min(1, Math.max(0, (cy - y0) / depth));
      c.strokeStyle = RED_DARK;
      c.lineWidth = 1.15;
      c.globalAlpha = 0.5 + 0.25 * deep + 0.1 * hash(k * 3.3 + seed);
      c.beginPath();
      const n = Math.round(patchW / 4.6);
      for (let i = 0; i <= n; i++) {
        const u = (i / n - 0.5) * patchW;
        const side = i % 2 === 0 ? -1 : 1;
        const v = side * half * (0.82 + 0.18 * hash(i * 0.37 + k));
        const x = cx + ux * u + vx * v;
        const y = cy + uy * u + vy * v;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  c.globalAlpha = 1;
  // Long pen strokes over the colouring: a few dark diagonals, denser with depth.
  const stroke = (
    color: string,
    alpha: number,
    width: number,
    spacing: number,
    angle: number,
    start: number,
    salt: number,
  ): void => {
    c.strokeStyle = color;
    c.lineWidth = width;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const span = x1 - x0 + depth * 2;
    let i = 0;
    for (let u = -depth; u < span; u += spacing, i++) {
      const r = hash(i * 0.731 + salt);
      if (r < 0.12) continue; // the pen skips now and then
      const sx = x0 + u;
      const sy = y0 + depth * start + r * spacing;
      const len = depth * (0.6 + 0.8 * hash(i * 1.37 + salt));
      c.globalAlpha = alpha * (0.6 + 0.4 * hash(i * 2.1 + salt));
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
  stroke(RED_DARK, 0.35, 1.1, 11, 1.05, 0.05, seed);
  stroke(RED_DARK, 0.3, 1, 14, 2.0, 0.35, seed + 11);
  // Light red ballpoint near the surface, like the pen catching light on wet ink.
  stroke(RED_LIGHT, 0.4, 1, 9, 0.55, 0, seed + 23);
  c.globalAlpha = 1;
}

/** Surface height offset (meters, + is down) at world x and a quantized time. */
export function rippleAt(x: number, t: number, seed: number): number {
  const a = Math.sin(x * 2.3 + t * 2.1 + seed) * 0.55;
  const b = Math.sin(x * 5.1 - t * 3.3 + seed * 1.7) * 0.3;
  const c = (hash(Math.floor(x * 4) + seed + Math.floor(t * SURFACE_FPS) * 0.01) - 0.5) * 0.3;
  return (a + b + c) * RIPPLE;
}

/** Where the drawn surface sits below the authored pool top (meters, + is down). */
export function surfaceOffset(x: number, t: number, seed: number): number {
  return RIPPLE + rippleAt(x, t, seed);
}

/** Bubbles: each 1.6 m slot of a pool runs its own rise-and-pop cycle. */
const BUBBLE_SLOT = 1.6;
const BUBBLE_PERIOD = 2.6;
const BUBBLE_RISE = 1.1;

type StrokePts = Parameters<Phaser.GameObjects.Graphics['strokePoints']>[0];

/**
 * One stretch of a pool's live surface: the rippling fill down to the static body, a hand-inked
 * contour (a heavy pass, then a looser one where the pen lifts and overlaps), clustered glints of
 * catch-light under it, and a little curl where the ink meets its basin wall.
 */
function drawSurfaceRun(
  g: Phaser.GameObjects.Graphics,
  p: PoolShape,
  a: number,
  b: number,
  t: number,
): void {
  const surface = (x: number): number => m(p.top + surfaceOffset(x, t, p.seed));
  const wave: Pt[] = [];
  for (let x = a; x < b; x += 0.1) wave.push({ x: m(x), y: surface(x) });
  wave.push({ x: m(b), y: surface(b) });
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
  g.lineStyle(2.4, POOL_RED_DARK, 0.92);
  g.strokePoints(wave as unknown as StrokePts);
  // The second pass rides a hair below, out of phase, and breaks where the pen lifts.
  g.lineStyle(1.1, POOL_RED_DARK, 0.55);
  let run: Pt[] = [];
  const flush = (): void => {
    if (run.length > 1) g.strokePoints(run as unknown as StrokePts);
    run = [];
  };
  for (const q of wave) {
    const wx = q.x / m(1);
    if (hash(Math.floor(wx * 1.7) + p.seed * 0.37) < 0.3) flush();
    else run.push({ x: q.x, y: q.y + 1.6 + Math.sin(wx * 3.1 + p.seed) * 0.9 });
  }
  flush();
  // A faint continuous sheen, then glints in clusters (never evenly spaced), drifting on twos.
  g.lineStyle(1, POOL_RED_LIGHT, 0.35);
  g.strokePoints(wave.map((q) => ({ x: q.x, y: q.y + 3.5 })) as unknown as StrokePts);
  g.lineStyle(1.3, POOL_RED_LIGHT, 0.8);
  const slot = 0.45;
  for (let k = Math.floor(a / slot); k * slot < b; k++) {
    if (hash(k * 1.73 + p.seed) > 0.42) continue;
    const gx = (k + hash(k * 2.9 + p.seed)) * slot + Math.sin(t * 0.8 + k) * 0.05;
    const x0 = Math.max(a + 0.05, gx);
    const x1 = Math.min(b - 0.05, gx + 0.12 + 0.3 * hash(k * 4.1 + p.seed));
    if (x1 - x0 < 0.05) continue;
    const dy = m(0.06 + 0.05 * hash(k * 5.3 + p.seed));
    g.lineBetween(m(x0), surface(x0) + dy, m(x1), surface(x1) + dy);
  }
  // Where the ink meets its basin wall the contour curls down it (not at a view-clipped end).
  g.lineStyle(2, POOL_RED_DARK, 0.85);
  for (const [end, dir] of [
    [a, 1],
    [b, -1],
  ] as const) {
    if (Math.abs(end - (dir > 0 ? p.minX : p.maxX)) > 1e-6) continue;
    const x = m(end),
      y = surface(end);
    g.beginPath();
    g.moveTo(x + dir * 7, y);
    g.lineTo(x + dir * 1.8, y + 2.5);
    g.lineTo(x + dir * 1, y + 10);
    g.strokePath();
  }
}

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
    // Where another pool rests on this one there is no surface: split the edge around it.
    const covered = coveredSpans(p, pools);
    const runs: [number, number][] = [[a, b]];
    for (const [ca, cb] of covered) {
      for (let i = runs.length - 1; i >= 0; i--) {
        const [ra, rb] = runs[i] ?? [0, 0];
        if (cb <= ra || ca >= rb) continue;
        runs.splice(
          i,
          1,
          ...(
            [
              [ra, ca],
              [cb, rb],
            ] as [number, number][]
          ).filter(([u, v]) => v - u > 0.02),
        );
      }
    }
    for (const [ra, rb] of runs) drawSurfaceRun(g, p, ra, rb, t);
    if (calm) continue;
    // Bubbles.
    const first = Math.floor(a / BUBBLE_SLOT);
    for (let k = first; k * BUBBLE_SLOT < b; k++) {
      const phase = hash(k * 0.917 + p.seed) * BUBBLE_PERIOD;
      const cycle = (seconds + phase) % BUBBLE_PERIOD;
      const x = (k + 0.2 + 0.6 * hash(k * 1.31 + p.seed)) * BUBBLE_SLOT;
      if (x < a || x > b || inSpans(x, covered)) continue;
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
