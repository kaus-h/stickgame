import type { Vec2 } from '../../core';
import type { LevelDef, SolidDef } from '../../sim';

export type TerrainEdgeSide = 'top' | 'bottom' | 'left' | 'right' | 'slope';
export type TerrainEdgeContact = 'exposed' | 'solid' | 'hazard' | 'bounds';

export interface TerrainEdge {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly side: TerrainEdgeSide;
  readonly contact: TerrainEdgeContact;
}

const EPSILON = 1e-7;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const at = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Add the parameters on AB where it intersects CD, including collinear overlap endpoints. */
function addIntersectionCuts(a: Vec2, b: Vec2, c: Vec2, d: Vec2, cuts: number[]): void {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const q = subtract(c, a);
  const rLength = Math.hypot(r.x, r.y);
  const sLength = Math.hypot(s.x, s.y);
  const denominator = cross(r, s);
  const parallelTolerance = EPSILON * Math.max(1, rLength * sLength);

  if (Math.abs(denominator) <= parallelTolerance) {
    if (Math.abs(cross(q, r)) > EPSILON * Math.max(1, rLength * Math.hypot(q.x, q.y))) return;
    const rSquared = dot(r, r);
    if (rSquared <= EPSILON * EPSILON) return;
    const t0 = dot(q, r) / rSquared;
    const t1 = dot(subtract(d, a), r) / rSquared;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi < lo - EPSILON) return;
    cuts.push(clamp01(lo), clamp01(hi));
    return;
  }

  const t = cross(q, s) / denominator;
  const u = cross(q, r) / denominator;
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    cuts.push(clamp01(t));
  }
}

function onSegment(point: Vec2, a: Vec2, b: Vec2): boolean {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const length = Math.hypot(ab.x, ab.y);
  if (length <= EPSILON) return Math.hypot(ap.x, ap.y) <= EPSILON;
  if (Math.abs(cross(ab, ap)) / length > EPSILON) return false;
  const margin = EPSILON * length;
  const projection = dot(ap, ab);
  return projection >= -margin && projection <= dot(ab, ab) + margin;
}

/** Boundary-inclusive point-in-polygon test, used only on the tiny outside-edge probe. */
function contains(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (!a || !b) continue;
    if (onSegment(point, a, b)) return true;
    if (a.y > point.y !== b.y > point.y) {
      const crossingX = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (point.x < crossingX) inside = !inside;
    }
  }
  return inside;
}

function winding(solid: SolidDef): number {
  let twiceArea = 0;
  for (let i = 0; i < solid.points.length; i++) {
    const a = solid.points[i];
    const b = solid.points[(i + 1) % solid.points.length];
    if (a && b) twiceArea += cross(a, b);
  }
  // Project polygons are clockwise in screen coordinates, which has positive shoelace area.
  return twiceArea < 0 ? -1 : 1;
}

function sideFor(dx: number, dy: number, orientation: number): TerrainEdgeSide {
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return 'slope';
  // For clockwise screen-coordinate polygons, the outward normal is (dy, -dx).
  const nx = orientation * dy;
  const ny = orientation * -dx;
  if (Math.abs(nx) <= EPSILON * length) return ny < 0 ? 'top' : 'bottom';
  if (Math.abs(ny) <= EPSILON * length) return nx < 0 ? 'left' : 'right';
  return 'slope';
}

function addBoundsCuts(a: Vec2, b: Vec2, level: LevelDef, cuts: number[]): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > EPSILON) {
    for (const x of [level.bounds.minX, level.bounds.maxX]) {
      const t = (x - a.x) / dx;
      const y = a.y + dy * t;
      if (
        t >= -EPSILON &&
        t <= 1 + EPSILON &&
        y >= level.bounds.minY - EPSILON &&
        y <= level.bounds.maxY + EPSILON
      ) {
        cuts.push(clamp01(t));
      }
    }
  }
  if (Math.abs(dy) > EPSILON) {
    for (const y of [level.bounds.minY, level.bounds.maxY]) {
      const t = (y - a.y) / dy;
      const x = a.x + dx * t;
      if (
        t >= -EPSILON &&
        t <= 1 + EPSILON &&
        x >= level.bounds.minX - EPSILON &&
        x <= level.bounds.maxX + EPSILON
      ) {
        cuts.push(clamp01(t));
      }
    }
  }
}

function isAtBounds(point: Vec2, level: LevelDef): boolean {
  return (
    Math.abs(point.x - level.bounds.minX) <= EPSILON ||
    Math.abs(point.x - level.bounds.maxX) <= EPSILON ||
    Math.abs(point.y - level.bounds.minY) <= EPSILON ||
    Math.abs(point.y - level.bounds.maxY) <= EPSILON
  );
}

function outsideBounds(point: Vec2, level: LevelDef): boolean {
  return (
    point.x < level.bounds.minX - EPSILON ||
    point.x > level.bounds.maxX + EPSILON ||
    point.y < level.bounds.minY - EPSILON ||
    point.y > level.bounds.maxY + EPSILON
  );
}

function contactAt(
  midpoint: Vec2,
  outward: Vec2,
  level: LevelDef,
  solid: SolidDef,
): TerrainEdgeContact {
  const probe = {
    x: midpoint.x + outward.x * (2 * EPSILON),
    y: midpoint.y + outward.y * (2 * EPSILON),
  };
  if (isAtBounds(midpoint, level) || outsideBounds(probe, level)) return 'bounds';

  let touchesSolid = false;
  for (const other of level.solids) {
    if (other === solid || other.id === solid.id || !contains(probe, other.points)) continue;
    if (other.kind === 'hazard') return 'hazard';
    touchesSolid = true;
  }
  return touchesSolid ? 'solid' : 'exposed';
}

/**
 * Split a directed polygon boundary at every contact and level-bound intersection, then
 * classify each interval by probing just outside its edge. The input level and polygon remain
 * untouched; output order follows the authored edge and cutpoint order.
 */
export function classifyTerrainEdges(level: LevelDef, solid: SolidDef): TerrainEdge[] {
  if (solid.points.length < 2) return [];
  const orientation = winding(solid);
  const out: TerrainEdge[] = [];
  for (let i = 0; i < solid.points.length; i++) {
    const a = solid.points[i];
    const b = solid.points[(i + 1) % solid.points.length];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) continue;

    const cuts = [0, 1];
    for (const other of level.solids) {
      if (other === solid || other.id === solid.id) continue;
      for (let j = 0; j < other.points.length; j++) {
        const c = other.points[j];
        const d = other.points[(j + 1) % other.points.length];
        if (c && d) addIntersectionCuts(a, b, c, d, cuts);
      }
    }
    addBoundsCuts(a, b, level, cuts);

    cuts.sort((x, y) => x - y);
    const unique: number[] = [];
    for (const t of cuts) {
      const previous = unique[unique.length - 1];
      if (previous === undefined || t - previous > EPSILON / length) unique.push(t);
    }
    const outward = { x: (orientation * dy) / length, y: (orientation * -dx) / length };
    const side = sideFor(dx, dy, orientation);
    for (let j = 0; j + 1 < unique.length; j++) {
      const t0 = unique[j];
      const t1 = unique[j + 1];
      if (t0 === undefined || t1 === undefined || (t1 - t0) * length <= EPSILON) continue;
      const start = at(a, b, t0);
      const end = at(a, b, t1);
      const midpoint = at(start, end, 0.5);
      out.push({ a: start, b: end, side, contact: contactAt(midpoint, outward, level, solid) });
    }
  }
  return out;
}

/** Teeth sit on a continuous terrain surface; pools still terminate its contact contour. */
export function classifyTerrainSurfaceEdges(level: LevelDef, solid: SolidDef): TerrainEdge[] {
  return classifyTerrainEdges(
    {
      ...level,
      solids: level.solids.filter(
        (other) => other.kind !== 'hazard' || !/thorn|spike|teeth/i.test(other.id),
      ),
    },
    solid,
  );
}
