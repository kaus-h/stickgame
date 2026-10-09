import { SeededRng } from '../../core';
import type { DeathRecord, LevelDef, SolidDef } from '../../sim';

/**
 * Death bodies (GMR-104, owner direction 2026-10-08): a small Verlet stick figure left wherever
 * the hero died. Presentation only: it reads the level's static geometry and never touches the
 * simulation or the physics adapter, and nothing in the simulation can see it. Units are metres.
 */

/** Drawn hero scale (drawHero HERO_ART_SCALE): the body matches the live hero's size. */
const S = 1.3;
/** Point order: head, neck, hip, knee/foot ×2, elbow/hand ×2. */
export const HEAD = 0;
export const NECK = 1;
export const HIP = 2;
/** Limb chains drawn as strokes (and constrained as bones). */
export const LIMBS: readonly (readonly number[])[] = [
  [NECK, HIP],
  [HIP, 3, 4],
  [HIP, 5, 6],
  [NECK, 7, 8],
  [NECK, 9, 10],
];
export const HEAD_R = 0.2 * S;
/** Collision radii: the head rests on its outline, limbs on their stroke. */
const RADIUS = [0.17 * S, 0.03, 0.04, 0.03, 0.04, 0.03, 0.04, 0.03, 0.03, 0.03, 0.03];
const BONES: readonly (readonly [number, number])[] = [
  [HEAD, NECK],
  [HEAD, HIP],
  ...LIMBS.flatMap((chain) => chain.slice(1).map((p, i) => [chain[i] ?? 0, p] as const)),
];
/** How far a body sinks into a hazard before it sticks (m). */
export const HAZARD_SINK = 0.12;
/** Render-side fixed step and the most steps one frame may take. */
export const BODY_STEP = 1 / 120;
export const MAX_STEPS = 6;
const SETTLE_SPEED = 0.1;
const SETTLE_TIME = 0.5;
export const MAX_AGE = 4;
const ITERATIONS = 4;

export interface BodySegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly hazard: boolean;
}

/** Polygon edges of the level's static solids and hazards (mirrors sim levelSegments). */
export function bodySegments(level: LevelDef): BodySegment[] {
  const out: BodySegment[] = [];
  for (const s of level.solids) {
    s.points.forEach((a, i) => {
      const b = s.points[(i + 1) % s.points.length] ?? a;
      out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, hazard: s.kind === 'hazard' });
    });
  }
  return out;
}

/** Stable seed from the death event: tick and position (millimetres). */
export function deathSeed(d: Pick<DeathRecord, 'tick' | 'at'>): number {
  let h = Math.imul(d.tick ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(Math.round(d.at.x * 1000), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= Math.imul(Math.round(d.at.y * 1000), 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

/** One Verlet point: position, previous position, step start, and a hazard pin. */
export interface BodyPoint {
  x: number;
  y: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  readonly r: number;
  pinned: boolean;
}

interface Bone {
  readonly a: BodyPoint;
  readonly b: BodyPoint;
  readonly rest: number;
}

export interface Ragdoll {
  readonly points: readonly BodyPoint[];
  readonly bones: readonly Bone[];
  readonly seed: number;
  readonly facing: -1 | 1;
  age: number;
  still: number;
  stuck: boolean;
  frozen: boolean;
}

/** Point i of a body (see the point order above). */
export const bodyPoint = (rd: Pick<Ragdoll, 'points'>, i: number): BodyPoint =>
  rd.points[i] ?? (rd.points[0] as BodyPoint);

interface SpawnProjection {
  readonly x: number;
  readonly y: number;
  readonly hazard: boolean;
}

/** Purely project an initially embedded body point to the nearest authored solid boundary. */
export function projectSpawnPoint(
  point: Pick<BodyPoint, 'x' | 'y' | 'r'>,
  solids: readonly SolidDef[],
): SpawnProjection | null {
  let nearestHazard: { solid: SolidDef; x: number; y: number; distance2: number } | null = null;
  let nearestSolid: { solid: SolidDef; x: number; y: number; distance2: number } | null = null;
  for (const solid of solids) {
    if (!inside(point.x, point.y, solid.points)) continue;
    const nearest = nearestBoundary(point.x, point.y, solid.points);
    if (solid.kind === 'hazard') {
      if (!nearestHazard || nearest.distance2 < nearestHazard.distance2)
        nearestHazard = { solid, ...nearest };
    } else if (!nearestSolid || nearest.distance2 < nearestSolid.distance2) {
      nearestSolid = { solid, ...nearest };
    }
  }

  if (nearestHazard) {
    let dx = point.x - nearestHazard.x;
    let dy = point.y - nearestHazard.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      const center = polygonCenter(nearestHazard.solid.points);
      dx = center.x - nearestHazard.x;
      dy = center.y - nearestHazard.y;
      len = Math.hypot(dx, dy) || 1;
    }
    return {
      x: nearestHazard.x + (dx / len) * HAZARD_SINK,
      y: nearestHazard.y + (dy / len) * HAZARD_SINK,
      hazard: true,
    };
  }
  if (!nearestSolid) return null;

  const points = nearestSolid.solid.points;
  const edge = nearestBoundaryEdge(point.x, point.y, points);
  const a = points[edge] as { x: number; y: number };
  const b = points[(edge + 1) % points.length] as { x: number; y: number };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const area = signedArea(points);
  // Positive winding keeps the polygon interior on each edge's left side.
  const nx = area > 0 ? dy / len : -dy / len;
  const ny = area > 0 ? -dx / len : dx / len;
  const gap = point.r + 1e-4;
  return {
    x: nearestSolid.x + nx * gap,
    y: nearestSolid.y + ny * gap,
    hazard: false,
  };
}

function inside(x: number, y: number, points: readonly { x: number; y: number }[]): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i] as { x: number; y: number };
    const b = points[j] as { x: number; y: number };
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function nearestBoundary(
  x: number,
  y: number,
  points: readonly { x: number; y: number }[],
): { x: number; y: number; distance2: number } {
  const edge = nearestBoundaryEdge(x, y, points);
  const a = points[edge] as { x: number; y: number };
  const b = points[(edge + 1) % points.length] as { x: number; y: number };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  const px = a.x + dx * t;
  const py = a.y + dy * t;
  return { x: px, y: py, distance2: (x - px) ** 2 + (y - py) ** 2 };
}

function nearestBoundaryEdge(
  x: number,
  y: number,
  points: readonly { x: number; y: number }[],
): number {
  let nearest = 0;
  let distance2 = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as { x: number; y: number };
    const b = points[(i + 1) % points.length] as { x: number; y: number };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < distance2) {
      nearest = i;
      distance2 = d2;
    }
  }
  return nearest;
}

function signedArea(points: readonly { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as { x: number; y: number };
    const b = points[(i + 1) % points.length] as { x: number; y: number };
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

function polygonCenter(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

/** A body in its death pose, moving with the death velocity. Same death, same body. */
export function createRagdoll(d: Pick<DeathRecord, 'tick' | 'at' | 'velocity'>): Ragdoll {
  const seed = deathSeed(d);
  const rng = new SeededRng(seed);
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng.next();
  const facing: -1 | 1 =
    d.velocity.x > 0.1 ? 1 : d.velocity.x < -0.1 ? -1 : rng.next() < 0.5 ? -1 : 1;
  // Local pose in hero proportions (drawHero), then a seeded tilt about the body centre.
  const head = { x: facing * 0.01 * S, y: -0.13 * S };
  const neck = { x: 0, y: 0.06 * S };
  const hip = { x: 0, y: 0.19 * S };
  const local = [head, neck, hip];
  const limb = (from: { x: number; y: number }, a: number, b: number, l1: number, l2: number) => {
    const mid = { x: from.x + Math.sin(a) * l1 * S, y: from.y + Math.cos(a) * l1 * S };
    local.push(mid, { x: mid.x + Math.sin(b) * l2 * S, y: mid.y + Math.cos(b) * l2 * S });
  };
  for (let k = 0; k < 2; k++) {
    const a = r(-0.9, 0.9);
    limb(hip, a, a + r(-0.2, 1.1) * facing, 0.165, 0.14);
  }
  for (let k = 0; k < 2; k++) {
    const a = r(-2.6, 2.6);
    limb(neck, a, a + r(-1, 1), 0.1, 0.09);
  }
  const tilt = r(-0.5, 0.5);
  const spin = r(-5, 5); // rad/s
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const points = local.map((p, i): BodyPoint => {
    const wx = p.x * c - p.y * s;
    const wy = p.x * s + p.y * c;
    const x = d.at.x + wx;
    const y = d.at.y + wy;
    // Verlet: the previous position carries the death velocity plus a little seeded spin.
    const px = x - (d.velocity.x - spin * wy) * BODY_STEP;
    const py = y - (d.velocity.y + spin * wx) * BODY_STEP;
    return { x, y, px, py, sx: x, sy: y, r: RADIUS[i] ?? 0.03, pinned: false };
  });
  const bones = BONES.map(([i, j]): Bone => {
    const a = bodyPoint({ points }, i);
    const b = bodyPoint({ points }, j);
    return { a, b, rest: Math.hypot(a.x - b.x, a.y - b.y) };
  });
  return { points, bones, seed, facing, age: 0, still: 0, stuck: false, frozen: false };
}

/** Advance by `steps` fixed BODY_STEPs (the caller accumulates frame time). */
export function stepRagdoll(
  rd: Ragdoll,
  steps: number,
  gravity: number,
  segments: readonly BodySegment[],
  floorY = Infinity,
): void {
  for (let k = 0; k < steps && !rd.frozen; k++) substep(rd, gravity, segments, floorY);
}

function substep(rd: Ragdoll, gravity: number, segs: readonly BodySegment[], floorY: number): void {
  const h = BODY_STEP;
  const damp = rd.stuck ? 0.8 : 0.996;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of rd.points) {
    p.sx = p.x;
    p.sy = p.y;
    if (p.pinned) continue;
    const vx = (p.x - p.px) * damp;
    const vy = (p.y - p.py) * damp;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + gravity * h * h;
    minX = Math.min(minX, p.x, p.sx);
    maxX = Math.max(maxX, p.x, p.sx);
    minY = Math.min(minY, p.y, p.sy);
    maxY = Math.max(maxY, p.y, p.sy);
  }
  // Broadphase once per step: only the edges near the body's swept box.
  const pad = HEAD_R + 0.3;
  const near = segs.filter(
    (s) =>
      Math.max(s.ax, s.bx) >= minX - pad &&
      Math.min(s.ax, s.bx) <= maxX + pad &&
      Math.max(s.ay, s.by) >= minY - pad &&
      Math.min(s.ay, s.by) <= maxY + pad,
  );
  for (let it = 0; it < ITERATIONS; it++) {
    for (const { a, b, rest } of rd.bones) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1e-9;
      // Pinned points do not move; the free end takes the whole correction.
      const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5;
      const wb = b.pinned ? 0 : a.pinned ? 1 : 0.5;
      const f = (len - rest) / len;
      a.x += dx * f * wa;
      a.y += dy * f * wa;
      b.x -= dx * f * wb;
      b.y -= dy * f * wb;
    }
    for (const p of rd.points) collide(rd, p, near);
  }
  let speed = 0;
  for (const p of rd.points) speed = Math.max(speed, Math.hypot(p.x - p.sx, p.y - p.sy) / h);
  rd.age += h;
  rd.still = speed < SETTLE_SPEED ? rd.still + h : 0;
  if (rd.still >= SETTLE_TIME || rd.age >= MAX_AGE || bodyPoint(rd, HIP).y > floorY)
    rd.frozen = true;
}

/** Keep a point out of solids (swept, then by radius); stick it a little way into hazards. */
function collide(rd: Ragdoll, p: BodyPoint, segs: readonly BodySegment[]): void {
  if (p.pinned) return;
  // Swept test from the step start: the first edge crossed wins.
  const rx = p.x - p.sx;
  const ry = p.y - p.sy;
  let hitT = Infinity;
  let hit: BodySegment | null = null;
  for (const s of segs) {
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const den = rx * dy - ry * dx;
    if (Math.abs(den) < 1e-12) continue;
    const ox = s.ax - p.sx;
    const oy = s.ay - p.sy;
    const t = (ox * dy - oy * dx) / den;
    const u = (ox * ry - oy * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < hitT) {
      hitT = t;
      hit = s;
    }
  }
  if (hit) {
    const n = towards(hit, p.sx, p.sy);
    const hx = p.sx + rx * hitT;
    const hy = p.sy + ry * hitT;
    if (hit.hazard) {
      // Sink partway into the hazard, then stick there.
      p.x = p.px = hx - n.x * HAZARD_SINK;
      p.y = p.py = hy - n.y * HAZARD_SINK;
      p.pinned = true;
      rd.stuck = true;
      return;
    }
    p.x = hx + n.x * 1e-4;
    p.y = hy + n.y * 1e-4;
    respond(p, n);
  }
  // Radius: push off nearby solid edges so the stroke rests on the line, not in it.
  // `segs` is the swept-box broadphase result from substep. Keep the radius pass local too;
  // scanning every level edge for every point and constraint iteration makes a 60-body pile
  // needlessly expensive while settling.
  for (const s of segs) {
    if (s.hazard) continue;
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / l2)) : 0;
    const cx = s.ax + dx * t;
    const cy = s.ay + dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d >= p.r) continue;
    const side = towards(s, p.sx, p.sy);
    const n = d > 1e-6 ? { x: (p.x - cx) / d, y: (p.y - cy) / d } : side;
    // Only push back towards the side the step started on: never through the edge.
    if (n.x * side.x + n.y * side.y < 0) continue;
    p.x = cx + n.x * p.r;
    p.y = cy + n.y * p.r;
    respond(p, n);
  }
}

/** Unit normal of the segment on the side of (px, py). */
function towards(s: BodySegment, px: number, py: number): { x: number; y: number } {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return (px - s.ax) * nx + (py - s.ay) * ny < 0 ? { x: -nx, y: -ny } : { x: nx, y: ny };
}

/** Contact: drop the velocity into the surface and apply friction along it. */
function respond(p: BodyPoint, n: { x: number; y: number }): void {
  const vx = p.x - p.px;
  const vy = p.y - p.py;
  const vn = vx * n.x + vy * n.y;
  const keep = Math.max(0, vn) * 0.2;
  p.px = p.x - (vx - vn * n.x) * 0.6 - n.x * keep;
  p.py = p.y - (vy - vn * n.y) * 0.6 - n.y * keep;
}
