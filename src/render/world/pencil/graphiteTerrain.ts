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

const MASS_DARK = '#43464d';
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

  // 1. Mass: dark graphite, lit from the top and the upper right, darkest under the undersides.
  c.save();
  c.clip(union);
  c.fillStyle = MASS_DARK;
  c.fillRect(tile.x, tile.y, tile.w, tile.h);
  for (const f of frames) {
    const depth = isTop(f) ? m(2.4) : isBottom(f) ? m(1.1) : m(0.9);
    const lit = isTop(f) ? 0.95 : f.nx < -0.5 ? 0.5 : f.nx > 0.5 ? 0.18 : 0;
    const g = c.createLinearGradient(
      (f.a.x + f.b.x) / 2,
      (f.a.y + f.b.y) / 2,
      (f.a.x + f.b.x) / 2 + f.nx * depth,
      (f.a.y + f.b.y) / 2 + f.ny * depth,
    );
    if (isBottom(f)) {
      g.addColorStop(0, 'rgba(10,11,14,0.6)');
      g.addColorStop(1, 'rgba(10,11,14,0)');
    } else {
      g.addColorStop(0, LIT(lit));
      g.addColorStop(0.5, LIT(lit * 0.45));
      g.addColorStop(1, LIT(0));
    }
    c.fillStyle = g;
    // A band hugging the edge, extended past the ends so corners blend.
    const ext = Math.min(depth, m(0.6));
    c.beginPath();
    c.moveTo(f.a.x - f.ux * ext, f.a.y - f.uy * ext);
    c.lineTo(f.b.x + f.ux * ext, f.b.y + f.uy * ext);
    c.lineTo(f.b.x + f.ux * ext + f.nx * depth, f.b.y + f.uy * ext + f.ny * depth);
    c.lineTo(f.a.x - f.ux * ext + f.nx * depth, f.a.y - f.uy * ext + f.ny * depth);
    c.closePath();
    c.fill();
  }
  // 2. World-locked cross-hatching over the tone, plus lifted light strokes and cracks.
  hatchField(c, tile, -1.45, 9 / hatchDensity, 'rgba(14,15,19,0.22)', 0.7, 1);
  hatchPatches(c, tile, hatchDensity);
  cracks(c, tile);
  // Graphite pools toward the bottom of the page: masses darken as they drop toward the pit.
  const sink = c.createLinearGradient(0, floorY - m(6.5), 0, floorY);
  sink.addColorStop(0, 'rgba(8,9,12,0)');
  sink.addColorStop(0.55, 'rgba(8,9,12,0.3)');
  sink.addColorStop(1, 'rgba(8,9,12,0.62)');
  c.fillStyle = sink;
  c.fillRect(tile.x, Math.max(tile.y, floorY - m(6.5)), tile.w, tile.h);
  // Light from above and the upper right lifts the upper faces, hatching included.
  c.globalCompositeOperation = 'screen';
  for (const f of frames) {
    if (!isTop(f) && !(f.nx < -0.5)) continue;
    const depth = isTop(f) ? m(1.7) : m(0.7);
    const lit = isTop(f) ? 0.55 : 0.3;
    const mx = (f.a.x + f.b.x) / 2,
      my = (f.a.y + f.b.y) / 2;
    const g = c.createLinearGradient(mx, my, mx + f.nx * depth, my + f.ny * depth);
    g.addColorStop(0, LIT(lit));
    g.addColorStop(0.4, LIT(lit * 0.5));
    g.addColorStop(1, LIT(0));
    c.fillStyle = g;
    const ext = m(0.5);
    c.beginPath();
    c.moveTo(f.a.x - f.ux * ext, f.a.y - f.uy * ext);
    c.lineTo(f.b.x + f.ux * ext, f.b.y + f.uy * ext);
    c.lineTo(f.b.x + f.ux * ext + f.nx * depth, f.b.y + f.uy * ext + f.ny * depth);
    c.lineTo(f.a.x - f.ux * ext + f.nx * depth, f.a.y - f.uy * ext + f.ny * depth);
    c.closePath();
    c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  c.restore();

  // 3. Edges: ragged sides, root-hung undersides, crusted tops (tops last: they stay crisp).
  for (const f of frames) if (!isTop(f) && !isBottom(f)) side(c, f);
  for (const f of frames) if (isBottom(f)) underside(c, f);
  for (const f of frames) if (isTop(f)) crust(c, f, frames);
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
  const angles = [-1.05, -0.8, -1.25, 0.5, 0.95, -0.35];
  c.lineCap = 'round';
  for (let gy = Math.floor(tile.y / cell) - 1; gy <= (tile.y + tile.h) / cell + 1; gy++) {
    for (let gx = Math.floor(tile.x / cell) - 1; gx <= (tile.x + tile.w) / cell + 1; gx++) {
      const r = rng(gx * 73856093 + gy * 19349663 + 11);
      const layers = r() < 0.45 ? 2 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const ang = (angles[Math.floor(r() * angles.length)] ?? -1) + (r() - 0.5) * 0.25;
        const ux = Math.cos(ang),
          uy = Math.sin(ang);
        const cx = gx * cell + cell / 2 + (r() - 0.5) * cell * 0.6,
          cy = gy * cell + cell / 2 + (r() - 0.5) * cell * 0.6;
        const strokes = Math.round((6 + r() * 7) * density * 0.7);
        const gap = 3 + r() * 2.2;
        const len = 18 + r() * 26;
        const dark = layer === 0 ? 0.42 + r() * 0.3 : 0.55 + r() * 0.3;
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

/** Ragged side contour: notches eaten into the face, a few chips proud of it, doubled ink. */
function side(c: CanvasRenderingContext2D, f: EdgeFrame): void {
  const pts: Pt[] = [];
  const step = 6;
  // Skip the top lip region so the crusted corner stays clean.
  const n = Math.max(2, Math.ceil(f.len / step));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * f.len;
    // Mostly inward, and deeper erosion further down the face (the top stays true).
    const below = f.uy * (f.uy > 0 ? t : t - f.len); // px below the edge's upper end
    const depthBelow = Math.abs(below);
    const amp = 4 + Math.min(8, depthBelow / 12);
    // Under the crusted lip the face is undercut, so the lip overhangs (never the top line).
    const undercut =
      depthBelow < 14 ? 0 : depthBelow < 60 ? Math.sin(((depthBelow - 14) / 46) * Math.PI) * 9 : 0;
    const wander = fbm1((t + f.seed) / 34, f.seed) * amp + amp * 0.35 + undercut;
    const along = Math.min(t, f.len - t);
    const fade = Math.min(1, along / 14);
    pts.push({
      x: f.a.x + f.ux * t + f.nx * wander * fade,
      y: f.a.y + f.uy * t + f.ny * wander * fade,
    });
  }
  // Eat notches into the mass where the contour moved inward (reveals the page behind).
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.moveTo(f.a.x - f.nx * 8, f.a.y - f.ny * 8);
  for (const p of pts) c.lineTo(p.x, p.y);
  c.lineTo(f.b.x - f.nx * 8, f.b.y - f.ny * 8);
  c.closePath();
  c.fillStyle = '#000';
  c.fill();
  c.restore();
  // Chips proud of the face where it bulges out.
  c.fillStyle = MASS_DARK;
  c.beginPath();
  c.moveTo(f.a.x, f.a.y);
  for (const p of pts) {
    const out = (p.x - f.a.x) * f.nx + (p.y - f.a.y) * f.ny;
    if (out < 0) c.lineTo(p.x, p.y);
    else {
      // project back onto the edge line
      const t = (p.x - f.a.x) * f.ux + (p.y - f.a.y) * f.uy;
      c.lineTo(f.a.x + f.ux * t, f.a.y + f.uy * t);
    }
  }
  c.lineTo(f.b.x, f.b.y);
  c.closePath();
  c.fill();
  // The contour: a heavy pass and a loose second pass.
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass === 0 ? INK : 'rgba(16,17,21,0.45)';
    c.lineWidth = pass === 0 ? 1.7 : 0.8;
    c.beginPath();
    pts.forEach((p, i) => {
      const off = pass === 0 ? 0 : 1.6;
      const x = p.x + f.nx * off,
        y = p.y + f.ny * off;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
  }
  // Vines spilling over the face from the lip: only on faces whose top is a lit corner.
  const r = rng(f.seed * 31 + 7);
  const topEnd = f.a.y < f.b.y ? f.a : f.b;
  const vines = r() < 0.7 ? 1 + Math.floor(r() * 4) : 0;
  for (let i = 0; i < vines; i++) {
    const x = topEnd.x - f.nx * (1 + r() * 4);
    const y = topEnd.y + 6 + r() * 10;
    root(c, x, y, Math.min(f.len * 0.8, 18 + r() * 70), r, 0.85, 1.3, 0.4);
  }
}

/** Underside: an irregular inked lip, hanging roots in clusters, and the odd loose crumb. */
function underside(c: CanvasRenderingContext2D, f: EdgeFrame): void {
  const pts: Pt[] = [];
  const n = Math.max(2, Math.ceil(f.len / 6));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * f.len;
    const wander = fbm1((t + f.seed) / 30, f.seed + 3) * 3;
    pts.push({ x: f.a.x + f.ux * t - f.nx * wander, y: f.a.y + f.uy * t - f.ny * wander });
  }
  c.fillStyle = MASS_DARK;
  c.beginPath();
  c.moveTo(f.a.x, f.a.y);
  for (const p of pts) c.lineTo(p.x, p.y);
  c.lineTo(f.b.x, f.b.y);
  c.closePath();
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.stroke();
  // Root clusters keyed to world x, so they never fall at even intervals.
  const x0 = Math.min(f.a.x, f.b.x),
    x1 = Math.max(f.a.x, f.b.x);
  const y = (f.a.y + f.b.y) / 2;
  for (let cx = Math.floor(x0 / 40) * 40; cx < x1; cx += 40) {
    const h = lattice(Math.floor(cx / 40), 91);
    if (h > 0.55 || cx < x0 + 6) continue;
    const r = rng(Math.floor(cx) * 7 + 3);
    const count = 1 + Math.floor(r() * 5);
    for (let k = 0; k < count; k++) {
      const rx = cx + r() * 40;
      if (rx > x1 - 6) continue;
      const long = r() < 0.3;
      root(c, rx, y - 1, long ? 30 + r() * 60 : 6 + r() * 22, r, 0.88, long ? 1.6 : 1.1, 0.5);
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
