import { metersToPixels as m } from '../../../core';
import type { SolidDef } from '../../../sim';
import type { TerrainEdge } from '../../kit/terrainEdges';
import { fbm1, lattice, noise1, rng } from './rng';
import { graphite, root, tuft } from './sketch';

/**
 * Chapter 1 terrain (pencil world): dense cross-hatched graphite masses with a pale crusted top
 * lip, darker undersides hung with roots, and ragged side contours. The walkable top edge is drawn
 * exactly on the collision line (art aligns to collision, never the reverse); only the sides and
 * undersides wander, and only by a few pixels. Every mark is seeded by world position, so the
 * per-tile bake is seamless and identical on every run.
 */
export interface GraphiteTile {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const MASS_MID = '#787c83';
const SHADE = (a: number): string => `rgba(14,15,19,${a.toFixed(3)})`;
const LIT = (a: number): string => `rgba(168,172,179,${a.toFixed(3)})`;
const CRUST = '#d0cec7';
const INK = 'rgba(16,17,21,0.92)';

type Pt = { x: number; y: number };

const pathOf = (solid: SolidDef): Path2D => {
  const p = new Path2D();
  solid.points.forEach((pt, i) => {
    if (i === 0) p.moveTo(m(pt.x), m(pt.y));
    else p.lineTo(m(pt.x), m(pt.y));
  });
  p.closePath();
  return p;
};

interface EdgeFrame {
  readonly a: Pt;
  readonly b: Pt;
  readonly len: number;
  /** Unit direction a → b. */
  readonly ux: number;
  readonly uy: number;
  /** Unit normal pointing into the solid. */
  readonly nx: number;
  readonly ny: number;
  readonly seed: number;
}

function frameOf(c: CanvasRenderingContext2D, path: Path2D, e: TerrainEdge): EdgeFrame | null {
  const a = { x: m(e.a.x), y: m(e.a.y) },
    b = { x: m(e.b.x), y: m(e.b.y) };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const ux = (b.x - a.x) / len,
    uy = (b.y - a.y) / len;
  let nx = -uy,
    ny = ux;
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  // isPointInPath ignores the current transform's translation only for the point, so test in
  // untransformed space by resetting the transform temporarily.
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const inside = c.isPointInPath(path, mx + nx * 3, my + ny * 3);
  c.restore();
  if (!inside) {
    nx = -nx;
    ny = -ny;
  }
  const seed = Math.round(a.x * 13 + a.y * 7 + b.x * 3 + b.y * 5) | 0;
  return { a, b, len, ux, uy, nx, ny, seed };
}

const isTop = (f: EdgeFrame): boolean => f.ny > 0.45;
const isBottom = (f: EdgeFrame): boolean => f.ny < -0.45;

/** Paint every solid's graphite mass and edge dressing into one baked tile. */
export function paintGraphiteTerrain(
  c: CanvasRenderingContext2D,
  solids: readonly SolidDef[],
  edgesOf: (solid: SolidDef) => readonly TerrainEdge[],
  tile: GraphiteTile,
  hatchDensity: number,
  floorY: number,
): void {
  if (solids.length === 0) return;
  const union = new Path2D();
  const paths = new Map<SolidDef, Path2D>();
  for (const s of solids) {
    const p = pathOf(s);
    paths.set(s, p);
    union.addPath(p);
  }
  const frames: EdgeFrame[] = [];
  for (const s of solids) {
    const p = paths.get(s);
    if (!p) continue;
    for (const e of edgesOf(s)) {
      if (e.contact !== 'exposed') continue;
      const f = frameOf(c, p, e);
      if (f) frames.push(f);
    }
  }

  // 1. Mass: mid-grey graphite. Darkest only along the shadow side (faces turned away from the
  // upper-right light) and under the undersides; the interior of big masses stays mid-grey.
  c.save();
  c.clip(union);
  c.fillStyle = MASS_MID;
  c.fillRect(tile.x, tile.y, tile.w, tile.h);
  tonalBlotches(c, tile);
  for (const f of frames) {
    const shadowSide = !isTop(f) && !isBottom(f) && f.nx > 0.5;
    if (!isBottom(f) && !shadowSide) continue;
    const depth = isBottom(f) ? m(0.9) : m(1.1);
    const mx = (f.a.x + f.b.x) / 2,
      my = (f.a.y + f.b.y) / 2;
    const g = c.createLinearGradient(mx, my, mx + f.nx * depth, my + f.ny * depth);
    g.addColorStop(0, SHADE(isBottom(f) ? 0.62 : 0.55));
    g.addColorStop(0.45, SHADE(isBottom(f) ? 0.26 : 0.22));
    g.addColorStop(1, SHADE(0));
    c.fillStyle = g;
    band(c, f, depth, m(0.4));
  }
  // 2. Directional hatching with a lighter crossing pass, lifted strokes and cracks.
  hatchField(c, tile, -1.45, 10 / hatchDensity, 'rgba(14,15,19,0.13)', 0.7, 1);
  hatchPatches(c, tile, hatchDensity);
  cracks(c, tile);
  // Graphite gathers a little toward the pit, capped so a deep mass never goes black.
  const sink = c.createLinearGradient(0, floorY - m(5), 0, floorY);
  sink.addColorStop(0, SHADE(0));
  sink.addColorStop(1, SHADE(0.22));
  c.fillStyle = sink;
  c.fillRect(tile.x, Math.max(tile.y, floorY - m(5)), tile.w, tile.h);
  // Light from above and the upper right lifts the upper faces and the lit sides.
  c.globalCompositeOperation = 'screen';
  for (const f of frames) {
    const litSide = !isTop(f) && !isBottom(f) && f.nx < -0.5;
    if (!isTop(f) && !litSide) continue;
    const depth = isTop(f) ? m(1.8) : m(0.8);
    const lit = isTop(f) ? 0.55 : 0.32;
    const mx = (f.a.x + f.b.x) / 2,
      my = (f.a.y + f.b.y) / 2;
    const g = c.createLinearGradient(mx, my, mx + f.nx * depth, my + f.ny * depth);
    g.addColorStop(0, LIT(lit));
    g.addColorStop(0.4, LIT(lit * 0.5));
    g.addColorStop(1, LIT(0));
    c.fillStyle = g;
    band(c, f, depth, m(0.5));
  }
  c.globalCompositeOperation = 'source-over';
  c.restore();

  // 3. Edges: ragged sides, root-hung undersides, crusted tops (tops last: they stay crisp).
  for (const f of frames) if (!isTop(f) && !isBottom(f)) side(c, f, frames);
  for (const f of frames) if (isBottom(f)) underside(c, f, frames);
  for (const f of frames) if (isTop(f)) crust(c, f, frames);
}

/** A band hugging an edge on its inner side, extended past the ends so corners blend. */
function band(c: CanvasRenderingContext2D, f: EdgeFrame, depth: number, ext: number): void {
  c.beginPath();
  c.moveTo(f.a.x - f.ux * ext, f.a.y - f.uy * ext);
  c.lineTo(f.b.x + f.ux * ext, f.b.y + f.uy * ext);
  c.lineTo(f.b.x + f.ux * ext + f.nx * depth, f.b.y + f.uy * ext + f.ny * depth);
  c.lineTo(f.a.x - f.ux * ext + f.nx * depth, f.a.y - f.uy * ext + f.ny * depth);
  c.closePath();
  c.fill();
}

/** Broad, soft world-seeded tonal variation so big masses never read as flat fills. */
function tonalBlotches(c: CanvasRenderingContext2D, tile: GraphiteTile): void {
  const cell = m(2.5);
  for (let gy = Math.floor(tile.y / cell) - 1; gy <= (tile.y + tile.h) / cell + 1; gy++) {
    for (let gx = Math.floor(tile.x / cell) - 1; gx <= (tile.x + tile.w) / cell + 1; gx++) {
      const r = rng(gx * 4441 + gy * 7177 + 3);
      const x = (gx + r()) * cell,
        y = (gy + r()) * cell;
      const rad = cell * (0.6 + r() * 0.8);
      const dark = r() < 0.5;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, dark ? SHADE(0.12 + r() * 0.08) : LIT(0.14 + r() * 0.1));
      g.addColorStop(1, dark ? SHADE(0) : LIT(0));
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
}

/** Long hatch lines across the tile at a slope (dy/dx), world-phased so tiles join. */
function hatchField(
  c: CanvasRenderingContext2D,
  tile: GraphiteTile,
  slope: number,
  spacing: number,
  color: string,
  width: number,
  seed: number,
): void {
  const left = tile.x - 16,
    right = tile.x + tile.w + 16;
  const offsets = [
    tile.y - 16 - slope * left,
    tile.y - 16 - slope * right,
    tile.y + tile.h + 16 - slope * left,
    tile.y + tile.h + 16 - slope * right,
  ];
  const lo = Math.floor(Math.min(...offsets) / spacing),
    hi = Math.ceil(Math.max(...offsets) / spacing);
  c.strokeStyle = color;
  for (let k = lo; k <= hi; k++) {
    const jitter = (lattice(k, seed) - 0.5) * spacing * 0.7;
    const offset = k * spacing + jitter;
    // Pencil pressure: some strokes break off, some double.
    c.lineWidth = width * (0.6 + lattice(k, seed + 9) * 0.8);
    c.beginPath();
    let drawing = false;
    for (let x = left; x <= right; x += 14) {
      const gap = lattice(Math.floor(x / 90) + k * 31, seed + 5) < 0.12;
      const y = slope * x + offset + Math.sin(x * 0.05 + k) * 1.4;
      if (gap) {
        drawing = false;
        continue;
      }
      if (!drawing) c.moveTo(x, y);
      else c.lineTo(x, y);
      drawing = true;
    }
    c.stroke();
  }
}

/**
 * Hand cross-hatching: world cells each hold a patch of short parallel strokes at the cell's own
 * angle (a few favoured directions), a second darker patch crossing it in some cells, and lifted
 * pale strokes where the paper shows through. Reads as drawn by hand, not as ruled rain.
 */
function hatchPatches(c: CanvasRenderingContext2D, tile: GraphiteTile, density: number): void {
  const cell = 34;
  const angles = [-1.05, -0.95, -1.15, -1.25, 0.55, -0.85];
  c.lineCap = 'round';
  for (let gy = Math.floor(tile.y / cell) - 1; gy <= (tile.y + tile.h) / cell + 1; gy++) {
    for (let gx = Math.floor(tile.x / cell) - 1; gx <= (tile.x + tile.w) / cell + 1; gx++) {
      const r = rng(gx * 73856093 + gy * 19349663 + 11);
      const layers = r() < 0.35 ? 2 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const ang = (angles[Math.floor(r() * angles.length)] ?? -1) + (r() - 0.5) * 0.25;
        const ux = Math.cos(ang),
          uy = Math.sin(ang);
        const cx = gx * cell + cell / 2 + (r() - 0.5) * cell * 0.6,
          cy = gy * cell + cell / 2 + (r() - 0.5) * cell * 0.6;
        const strokes = Math.round((6 + r() * 7) * density * 0.7);
        const gap = 3 + r() * 2.2;
        const len = 18 + r() * 26;
        const dark = layer === 0 ? 0.38 + r() * 0.22 : 0.42 + r() * 0.2;
        for (let k = 0; k < strokes; k++) {
          const o = (k - strokes / 2) * gap;
          const l = len * (0.6 + r() * 0.5);
          const sx = cx - uy * o - (ux * l) / 2 + (r() - 0.5) * 4,
            sy = cy + ux * o - (uy * l) / 2 + (r() - 0.5) * 4;
          c.strokeStyle = `rgba(12,13,17,${(dark * (0.6 + r() * 0.4)).toFixed(3)})`;
          c.lineWidth = 0.6 + r() * 0.8;
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(sx + ux * l, sy + uy * l);
          c.stroke();
        }
      }
      // Lifted pale strokes: paper tooth catching the light.
      if (r() < 0.5) {
        const ang = -1.1 + (r() - 0.5) * 0.4;
        const n = 2 + Math.floor(r() * 4);
        const cx = gx * cell + r() * cell,
          cy = gy * cell + r() * cell;
        c.strokeStyle = `rgba(222,225,230,${(0.1 + r() * 0.14).toFixed(3)})`;
        c.lineWidth = 0.8 + r() * 0.8;
        for (let k = 0; k < n; k++) {
          const l = 8 + r() * 16;
          const sx = cx + k * 3.5,
            sy = cy + (r() - 0.5) * 3;
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(sx + Math.cos(ang) * l, sy + Math.sin(ang) * l);
          c.stroke();
        }
      }
    }
  }
}

/** Short dark fissures and lighter chips, seeded per world cell. */
function cracks(c: CanvasRenderingContext2D, tile: GraphiteTile): void {
  const cell = 46;
  c.lineCap = 'round';
  for (let gy = Math.floor(tile.y / cell) - 1; gy <= (tile.y + tile.h) / cell + 1; gy++) {
    for (let gx = Math.floor(tile.x / cell) - 1; gx <= (tile.x + tile.w) / cell + 1; gx++) {
      const h = lattice(gx * 7919 + gy * 104729, 77);
      if (h > 0.32) continue;
      const r = rng(gx * 92821 + gy * 68917 + 5);
      let x = gx * cell + r() * cell,
        y = gy * cell + r() * cell;
      c.strokeStyle = h < 0.1 ? 'rgba(206,209,214,0.18)' : 'rgba(8,9,12,0.55)';
      c.lineWidth = 0.7 + r() * 0.7;
      c.beginPath();
      c.moveTo(x, y);
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        x += (r() - 0.5) * 18;
        y += 4 + r() * 12;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }
}

const near = (p: Pt, q: Pt): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 1;

/**
 * A ragged contour along an exposed edge. `profile(d)` gives the inward offset (px) at distance d
 * from `start` along `dir`: positive eats a notch into the mass (revealing the page), negative
 * pushes a rock chunk out of it.
 */
function raggedEdge(
  c: CanvasRenderingContext2D,
  start: Pt,
  dir: Pt,
  inward: Pt,
  len: number,
  profile: (d: number) => number,
  chunkFill: string,
): void {
  const n = Math.max(2, Math.ceil(len / 5));
  const pts: Pt[] = [];
  const offs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * len;
    const o = profile(d);
    offs.push(o);
    pts.push({ x: start.x + dir.x * d + inward.x * o, y: start.y + dir.y * d + inward.y * o });
  }
  const end = { x: start.x + dir.x * len, y: start.y + dir.y * len };
  // Notches: erase between a line well outside the edge and the contour.
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  c.beginPath();
  c.moveTo(start.x - inward.x * 14, start.y - inward.y * 14);
  for (const p of pts) c.lineTo(p.x, p.y);
  c.lineTo(end.x - inward.x * 14, end.y - inward.y * 14);
  c.closePath();
  c.fill();
  c.restore();
  // Chunks proud of the edge: filled mass.
  c.fillStyle = chunkFill;
  c.beginPath();
  c.moveTo(start.x, start.y);
  pts.forEach((p, i) => {
    const d = (i / n) * len;
    if ((offs[i] ?? 0) < 0) c.lineTo(p.x, p.y);
    else c.lineTo(start.x + dir.x * d, start.y + dir.y * d);
  });
  c.lineTo(end.x, end.y);
  c.closePath();
  c.fill();
  // The contour: a heavy pass and a loose second pass just inside it.
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass === 0 ? INK : 'rgba(16,17,21,0.42)';
    c.lineWidth = pass === 0 ? 1.7 : 0.8;
    c.beginPath();
    const off = pass === 0 ? 0 : 2;
    pts.forEach((p, i) => {
      if (i === 0) c.moveTo(p.x + inward.x * off, p.y + inward.y * off);
      else c.lineTo(p.x + inward.x * off, p.y + inward.y * off);
    });
    c.stroke();
  }
}

interface Bump {
  readonly at: number;
  readonly len: number;
  readonly size: number;
}

/** Seeded bumps along an edge (chunks or notches), irregularly spaced. */
function bumps(r: () => number, len: number, gap: number, size: number): Bump[] {
  const out: Bump[] = [];
  for (let d = 20 + r() * gap; d < len - 16; d += gap * (0.5 + r() * 1.3))
    out.push({ at: d, len: 10 + r() * 30, size: size * (0.4 + r() * 0.8) });
  return out;
}

const bumpAt = (list: readonly Bump[], d: number): number => {
  let o = 0;
  for (const b of list) {
    const t = (d - b.at) / b.len + 0.5;
    if (t > 0 && t < 1) o += Math.sin(t * Math.PI) * b.size;
  }
  return o;
};

/**
 * Vertical faces: a rounded overhanging lip under the crust, an undercut below it, a slight
 * seeded lean, chipped notches and protruding chunks, and an eroded lower corner where the face
 * meets an exposed underside. The walkable top line is never moved.
 */
function side(c: CanvasRenderingContext2D, f: EdgeFrame, frames: readonly EdgeFrame[]): void {
  const r = rng(f.seed * 31 + 7);
  const upperIsA = f.a.y <= f.b.y;
  const upper = upperIsA ? f.a : f.b,
    lower = upperIsA ? f.b : f.a;
  const dir = { x: (lower.x - upper.x) / f.len, y: (lower.y - upper.y) / f.len };
  const inward = { x: f.nx, y: f.ny };
  const lipped = frames.some((o) => isTop(o) && (near(o.a, upper) || near(o.b, upper)));
  const footed = frames.some((o) => isBottom(o) && (near(o.a, lower) || near(o.b, lower)));
  const lean = (r() - 0.35) * 0.06;
  const chunks = bumps(r, f.len, 70, 7);
  const notches = bumps(r, f.len, 55, 6);
  const profile = (d: number): number => {
    const e = f.len - d;
    if (lipped && d < 12) return -2.5 * Math.sin((d / 12) * Math.PI);
    let o = fbm1((d + f.seed) / 26, f.seed) * (2.5 + Math.min(4, d / 25)) + 2.5 + lean * d;
    if (lipped && d < 64) o += Math.sin(((d - 12) / 52) * Math.PI) * 10;
    o += bumpAt(notches, d) - bumpAt(chunks, d);
    if (footed && e < 46) o += (1 - e / 46) ** 2 * 18;
    const ramp = Math.min(1, (lipped ? 12 : d) / 6, e / 6);
    return Math.max(-9, Math.min(24, o * ramp));
  };
  const shadow = f.nx > 0.5;
  raggedEdge(c, upper, dir, inward, f.len, profile, shadow ? '#585b62' : '#8c9097');
  // Vines spilling over the face from the lip.
  if (lipped) {
    const vines = r() < 0.75 ? 1 + Math.floor(r() * 4) : 0;
    for (let i = 0; i < vines; i++) {
      const x = upper.x - inward.x * (1 + r() * 3);
      const y = upper.y + 4 + r() * 8;
      root(c, x, y, Math.min(f.len * 0.8, 16 + r() * 64), r, 0.85, 1.3, 0.4);
    }
  }
}

/** Undersides: wandering lip with hanging rock and notches, eroded rounded ends, roots. */
function underside(c: CanvasRenderingContext2D, f: EdgeFrame, frames: readonly EdgeFrame[]): void {
  const r = rng(f.seed * 17 + 5);
  const chunks = bumps(r, f.len, 60, 8);
  const notches = bumps(r, f.len, 45, 5);
  const capped = (p: Pt): boolean =>
    frames.some((o) => o !== f && !isBottom(o) && !isTop(o) && (near(o.a, p) || near(o.b, p)));
  const capA = capped(f.a),
    capB = capped(f.b);
  const profile = (d: number): number => {
    let o = fbm1((d + f.seed) / 24, f.seed + 3) * 3.5 + 1.5;
    o += bumpAt(notches, d) - bumpAt(chunks, d);
    const ea = d,
      eb = f.len - d;
    if (capA && ea < 40) o += (1 - ea / 40) ** 2 * 16;
    if (capB && eb < 40) o += (1 - eb / 40) ** 2 * 16;
    const ramp = Math.min(1, (capA ? 6 : ea) / 5, (capB ? 6 : eb) / 5);
    return Math.max(-10, Math.min(22, o * ramp));
  };
  raggedEdge(c, f.a, { x: f.ux, y: f.uy }, { x: f.nx, y: f.ny }, f.len, profile, '#4f5259');
  // Root clusters keyed to world x, so they never fall at even intervals.
  const x0 = Math.min(f.a.x, f.b.x),
    x1 = Math.max(f.a.x, f.b.x);
  const y = (f.a.y + f.b.y) / 2;
  for (let cx = Math.floor(x0 / 40) * 40; cx < x1; cx += 40) {
    const h = lattice(Math.floor(cx / 40), 91);
    if (h > 0.6 || cx < x0 + 6) continue;
    const rr = rng(Math.floor(cx) * 7 + 3);
    const count = 1 + Math.floor(rr() * 5);
    for (let k = 0; k < count; k++) {
      const rx = cx + rr() * 40;
      if (rx > x1 - 8 || rx < x0 + 8) continue;
      const long = rr() < 0.3;
      root(c, rx, y + 1, long ? 30 + rr() * 60 : 6 + rr() * 22, rr, 0.88, long ? 1.6 : 1.1, 0.5);
    }
  }
}

/**
 * The crusted walkable lip: a pale broken band whose upper edge is exactly the collision line,
 * a shadow line under it, grass tufts and pebbles above it in world-seeded clusters.
 */
function crust(c: CanvasRenderingContext2D, f: EdgeFrame, frames: readonly EdgeFrame[]): void {
  const n = Math.max(2, Math.ceil(f.len / 5));
  const lower: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * f.len;
    const wx = f.a.x + f.ux * t;
    // Worn spans where the crust has crumbled thin, so the lip never reads as a ruled stripe.
    const worn = noise1(wx / 70, 19) < 0.3 ? 0.35 : 1;
    const depth =
      (10 +
        fbm1(wx / 30, 11) * 6 +
        (lattice(Math.floor(wx / 9), 12) < 0.18 ? 5 + fbm1(wx, 4) * 3 : 0)) *
      worn;
    lower.push({ x: wx + f.nx * depth, y: f.a.y + f.uy * t + f.ny * depth });
  }
  // Corners: where the next exposed edge drops away (a convex lip), round the crust down it.
  const corner = (p: Pt): boolean =>
    frames.some(
      (o) =>
        o !== f &&
        !isTop(o) &&
        (Math.hypot(o.a.x - p.x, o.a.y - p.y) < 1 || Math.hypot(o.b.x - p.x, o.b.y - p.y) < 1),
    );
  c.fillStyle = CRUST;
  c.beginPath();
  c.moveTo(f.a.x, f.a.y);
  c.lineTo(f.b.x, f.b.y);
  for (let i = lower.length - 1; i >= 0; i--) {
    const p = lower[i];
    if (p) c.lineTo(p.x, p.y);
  }
  c.closePath();
  c.fill();
  // Texture in the crust: short graphite flecks lying along the surface.
  const r = rng(f.seed + 101);
  c.strokeStyle = 'rgba(40,42,48,0.35)';
  c.lineWidth = 0.7;
  for (let t = 0; t < f.len; t += 3 + r() * 6) {
    const d = 2 + r() * 6;
    const x = f.a.x + f.ux * t + f.nx * d,
      y = f.a.y + f.uy * t + f.ny * d;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + f.ux * (2 + r() * 5), y + f.uy * (2 + r() * 5));
    c.stroke();
  }
  // Shadow under the lip: a dark ragged line, then a soft falloff into the mass.
  c.strokeStyle = 'rgba(12,13,16,0.8)';
  c.lineWidth = 1.5;
  c.beginPath();
  lower.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.stroke();
  // Vines and roots spilling from under the lip down the lit face, in world-seeded clusters.
  for (let i = 2; i < lower.length - 2; i++) {
    const p = lower[i];
    if (!p) continue;
    const cellX = Math.floor(p.x / 22);
    if (lattice(cellX, 61) > 0.2 || Math.floor((p.x - 5) / 22) === cellX) continue;
    const vr = rng(cellX * 977 + 13);
    const n = 1 + Math.floor(vr() * 4);
    for (let k = 0; k < n; k++)
      root(c, p.x + (vr() - 0.5) * 14, p.y - 1, 10 + vr() * 46, vr, 0.8, 1.2, 0.5);
  }
  for (const end of [f.a, f.b]) {
    if (!corner(end)) continue;
    // A crumbling rounded corner: pale chips stepping down the face.
    const dir = end === f.a ? 1 : -1;
    const cr = rng(Math.round(end.x * 3 + end.y));
    c.fillStyle = CRUST;
    for (let k = 0; k < 3; k++) {
      const s = 3 + cr() * 4;
      const x = end.x + f.ux * dir * (1 + cr() * 5) + f.nx * (6 + k * 5),
        y = end.y + f.uy * dir * (1 + cr() * 5) + f.ny * (6 + k * 5);
      c.beginPath();
      c.ellipse(x, y, s, s * 0.7, cr(), 0, Math.PI * 2);
      c.fill();
    }
  }
  // The walkable line itself: crisp ink centred on the collision edge.
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(f.a.x, f.a.y);
  c.lineTo(f.b.x, f.b.y);
  c.stroke();
  // Grass and pebbles above the line, clustered by world x.
  const cell = 48;
  const x0 = Math.min(f.a.x, f.b.x),
    x1 = Math.max(f.a.x, f.b.x);
  for (let cx = Math.floor(x0 / cell) * cell; cx < x1; cx += cell) {
    const h = lattice(Math.floor(cx / cell), 55);
    if (h > 0.5) continue;
    const gr = rng(Math.floor(cx) * 13 + 1);
    const count = 1 + Math.floor(gr() * 3);
    for (let k = 0; k < count; k++) {
      const x = cx + gr() * cell;
      if (x < x0 + 3 || x > x1 - 3) continue;
      const t = (x - f.a.x) / (f.ux || 1);
      const y = f.a.y + f.uy * t;
      tuft(c, x, y, 5 + gr() * 9, gr, graphite(0.85), 3 + Math.floor(gr() * 4), 1.1);
    }
    if (gr() < 0.35) {
      const x = cx + gr() * cell;
      if (x > x0 + 4 && x < x1 - 4) {
        c.fillStyle = graphite(0.8);
        c.beginPath();
        c.ellipse(
          x,
          f.a.y + f.uy * ((x - f.a.x) / (f.ux || 1)) - 1.2,
          2 + gr() * 2,
          1.4,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
  }
}
