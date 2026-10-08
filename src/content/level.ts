import { vec2, type Vec2 } from '../core';
import type { AnchorDef, LevelDef, SolidDef } from '../sim';

/** Level JSON schema version understood by this build (doc 32). */
export const LEVEL_SCHEMA_VERSION = 1;

/** Anchor impact radius when level data omits one, m. */
export const DEFAULT_ANCHOR_RADIUS = 0.4;

/**
 * Moving-anchor envelope (GMR-26, docs/moving-anchors.md). A path's peak speed is half-span·ω and
 * its peak acceleration half-span·ω² (ω = 2π / period). Inside these limits the swing matches an
 * ideal pendulum on the same pivot, stays learnable (outcome sensitivity at most ~2x a fixed
 * anchor over a 2 s ride) and a rope within 66° of vertical never goes slack from the pivot alone.
 */
export const MAX_ANCHOR_SPEED = 8;
/** m/s²: 0.4 × gravity (30). Above it, pivot-driven chaos and slack ropes appear in the lab. */
export const MAX_ANCHOR_ACCEL = 12;

/** Peak speed (m/s) and acceleration (m/s²) of a ping-pong path from `from` to `to`. */
export function anchorPathPeaks(
  from: Vec2,
  to: Vec2,
  period: number,
): { speed: number; accel: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const half = Math.sqrt(dx * dx + dy * dy) / 2;
  const w = (2 * Math.PI) / period;
  return { speed: half * w, accel: half * w * w };
}

export class LevelError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, msg: string): never {
  throw new LevelError(`${path}: ${msg}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'must be a non-empty string');
  return v;
}

function point(v: unknown, path: string): Vec2 {
  if (Array.isArray(v) && v.length === 2)
    return vec2(num(v[0], `${path}[0]`), num(v[1], `${path}[1]`));
  if (isRecord(v)) return vec2(num(v.x, `${path}.x`), num(v.y, `${path}.y`));
  return fail(path, 'must be [x, y] or {x, y}');
}

function solid(v: unknown, path: string): SolidDef {
  if (!isRecord(v)) fail(path, 'must be an object');
  const kind = v.kind ?? 'solid';
  if (kind !== 'solid' && kind !== 'hazard') fail(`${path}.kind`, 'must be "solid" or "hazard"');
  let points: Vec2[];
  if (isRecord(v.rect)) {
    // Shorthand: an axis-aligned box.
    const r = v.rect;
    const x0 = num(r.x, `${path}.rect.x`);
    const y0 = num(r.y, `${path}.rect.y`);
    const w = num(r.w, `${path}.rect.w`);
    const h = num(r.h, `${path}.rect.h`);
    if (w <= 0 || h <= 0) fail(`${path}.rect`, 'w and h must be positive');
    points = [vec2(x0, y0), vec2(x0 + w, y0), vec2(x0 + w, y0 + h), vec2(x0, y0 + h)];
  } else if (Array.isArray(v.points)) {
    points = v.points.map((p, i) => point(p, `${path}.points[${String(i)}]`));
    if (points.length < 3) fail(`${path}.points`, 'needs at least 3 points');
  } else {
    return fail(path, 'needs "rect" or "points"');
  }
  return { id: str(v.id, `${path}.id`), kind, points };
}

function anchor(v: unknown, path: string): AnchorDef {
  if (!isRecord(v)) fail(path, 'must be an object');
  const radius = v.radius === undefined ? DEFAULT_ANCHOR_RADIUS : num(v.radius, `${path}.radius`);
  if (radius <= 0) fail(`${path}.radius`, 'must be positive');
  const base = {
    id: str(v.id, `${path}.id`),
    position: point(v.position, `${path}.position`),
    radius,
  };
  if (v.path === undefined) return base;
  if (!isRecord(v.path)) fail(`${path}.path`, 'must be an object');
  const period = num(v.path.period, `${path}.path.period`);
  if (period <= 0) fail(`${path}.path.period`, 'must be positive');
  const to = point(v.path.to, `${path}.path.to`);
  const phase = v.path.phase === undefined ? undefined : num(v.path.phase, `${path}.path.phase`);
  if (phase !== undefined && (phase < 0 || phase >= 1)) {
    fail(`${path}.path.phase`, 'must be in [0, 1)');
  }
  const peaks = anchorPathPeaks(base.position, to, period);
  if (peaks.speed > MAX_ANCHOR_SPEED) {
    fail(
      `${path}.path`,
      `peak speed ${peaks.speed.toFixed(2)} m/s exceeds ${String(MAX_ANCHOR_SPEED)} m/s (shorten the span or lengthen the period)`,
    );
  }
  if (peaks.accel > MAX_ANCHOR_ACCEL) {
    fail(
      `${path}.path`,
      `peak acceleration ${peaks.accel.toFixed(2)} m/s² exceeds ${String(MAX_ANCHOR_ACCEL)} m/s² (lengthen the period)`,
    );
  }
  return { ...base, path: { to, period, ...(phase === undefined ? {} : { phase }) } };
}

/** Validate untrusted level JSON. Errors name the offending path. */
export function parseLevel(json: unknown): LevelDef {
  if (!isRecord(json)) fail('level', 'must be an object');
  if (json.version !== LEVEL_SCHEMA_VERSION) {
    fail('level.version', `must be ${String(LEVEL_SCHEMA_VERSION)}`);
  }
  if (!isRecord(json.bounds)) fail('level.bounds', 'must be an object');
  const b = json.bounds;
  const solids = Array.isArray(json.solids)
    ? json.solids
    : fail('level.solids', 'must be an array');
  const anchors = Array.isArray(json.anchors) ? json.anchors : [];
  const ids = new Set<string>();
  const level: LevelDef = {
    id: str(json.id, 'level.id'),
    name: str(json.name, 'level.name'),
    spawn: point(json.spawn, 'level.spawn'),
    bounds: {
      minX: num(b.minX, 'level.bounds.minX'),
      minY: num(b.minY, 'level.bounds.minY'),
      maxX: num(b.maxX, 'level.bounds.maxX'),
      maxY: num(b.maxY, 'level.bounds.maxY'),
    },
    killY: num(json.killY, 'level.killY'),
    solids: solids.map((s, i) => solid(s, `level.solids[${String(i)}]`)),
    anchors: anchors.map((a, i) => anchor(a, `level.anchors[${String(i)}]`)),
    ...(isRecord(json.exit)
      ? {
          exit: {
            min: point(json.exit.min, 'level.exit.min'),
            max: point(json.exit.max, 'level.exit.max'),
          },
        }
      : {}),
  };
  for (const item of [...level.solids, ...level.anchors]) {
    if (ids.has(item.id)) fail('level', `duplicate id "${item.id}"`);
    ids.add(item.id);
  }
  return level;
}
