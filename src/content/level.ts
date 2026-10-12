import { vec2, type Vec2 } from '../core';
import type { AnchorDef, AnchorTimerDef, LevelDef, PatrollerDef, SolidDef } from '../sim';
import schemaValidator from './level-validator.generated.js';

/** Level JSON schema version understood by this build (doc 32). */
export const LEVEL_SCHEMA_VERSION = 2;

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

/** Renderer-only background selection authored with a level. */
export type LevelTheme = 'paper' | 'scenery';

// Presentation metadata stays outside LevelDef so it cannot affect simulation or replay hashes.
const levelThemes = new WeakMap<LevelDef, LevelTheme>();

/** Resolve the authored presentation theme without making it simulation state. */
export function getLevelTheme(level: LevelDef): LevelTheme {
  return levelThemes.get(level) ?? 'paper';
}

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

/** The checked migration output preserves authoring point spelling and optional metadata. */
export type AuthoringLevelV2 = Record<string, unknown> & { version: 2 };

function schemaPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .reduce((path, part) => {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      return /^\d+$/.test(key) ? `${path}[${key}]` : `${path}.${key}`;
    }, 'level');
}

/** Validate against the shipped draft-07 schema, including unknown-field rejection. */
export function validateLevelSchema(json: unknown): void {
  if (schemaValidator(json)) return;
  const messages = (schemaValidator.errors ?? []).map((error) => {
    let path = schemaPath(error.instancePath);
    if (error.keyword === 'required') path += `.${String(error.params.missingProperty)}`;
    if (error.keyword === 'additionalProperties')
      path += `.${String(error.params.additionalProperty)}`;
    return `${path}: ${error.message ?? 'invalid schema value'}`;
  });
  throw new LevelError(messages.join('\n'));
}

/** Pure v1 → v2 migration. Stable authored IDs and geometry are never regenerated. */
export function migrateLevel(json: unknown): AuthoringLevelV2 {
  validateLevelSchema(json);
  if (!isRecord(json)) fail('level', 'must be an object');
  return {
    ...structuredClone(json),
    version: 2,
    telemetry: structuredClone(json.telemetry ?? { levelId: json.id }),
    anchors: structuredClone(json.anchors ?? []),
  };
}

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
  return {
    id: str(v.id, `${path}.id`),
    kind,
    points,
    ...(Array.isArray(v.visualPoints)
      ? {
          visualPoints: v.visualPoints.map((p, i) =>
            point(p, `${path}.visualPoints[${String(i)}]`),
          ),
        }
      : {}),
  };
}

function anchor(v: unknown, path: string): AnchorDef {
  if (!isRecord(v)) fail(path, 'must be an object');
  const radius = v.radius === undefined ? DEFAULT_ANCHOR_RADIUS : num(v.radius, `${path}.radius`);
  if (radius <= 0) fail(`${path}.radius`, 'must be positive');
  const base = {
    id: str(v.id, `${path}.id`),
    position: point(v.position, `${path}.position`),
    radius,
    ...(v.requiredFrom === undefined
      ? {}
      : { requiredFrom: point(v.requiredFrom, `${path}.requiredFrom`) }),
    ...anchorExtras(v, path),
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

/** Timed and one-use anchors (GMR-60). Timed: on ≥ 1 s (room for the 0.5 s telegraph), off ≥ 0.25 s. */
function anchorExtras(
  v: Record<string, unknown>,
  path: string,
): { timed?: AnchorTimerDef; oneUse?: true } {
  const out: { timed?: AnchorTimerDef; oneUse?: true } = {};
  if (v.oneUse !== undefined) {
    if (typeof v.oneUse !== 'boolean') fail(`${path}.oneUse`, 'must be a boolean');
    if (v.oneUse) out.oneUse = true;
  }
  if (v.timed !== undefined) {
    if (!isRecord(v.timed)) fail(`${path}.timed`, 'must be an object');
    const on = num(v.timed.on, `${path}.timed.on`);
    const off = num(v.timed.off, `${path}.timed.off`);
    if (on < 1) fail(`${path}.timed.on`, 'must be at least 1 s (the telegraph takes 0.5 s)');
    if (off < 0.25) fail(`${path}.timed.off`, 'must be at least 0.25 s');
    const phase =
      v.timed.phase === undefined ? undefined : num(v.timed.phase, `${path}.timed.phase`);
    if (phase !== undefined && (phase < 0 || phase >= 1))
      fail(`${path}.timed.phase`, 'must be in [0, 1)');
    out.timed = { on, off, ...(phase === undefined ? {} : { phase }) };
  }
  return out;
}

/** Validate untrusted level JSON. Errors name the offending path. */
export function compileLevel(source: unknown): LevelDef {
  const json = migrateLevel(source);
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
    ...(json.enemies === undefined
      ? {}
      : {
          enemies: entries(json.enemies).map((enemy, i) =>
            patroller(enemy, `level.enemies[${String(i)}]`),
          ),
        }),
    ...authoringMetadata(json),
    ...(isRecord(json.exit)
      ? {
          exit: compileExit(json.exit),
        }
      : {}),
  };
  for (const item of [
    ...level.solids,
    ...level.anchors,
    ...(level.enemies ?? []),
    ...(level.chambers ?? []),
    ...(level.checkpoints ?? []),
    ...(level.cameraHints ?? []),
    ...(level.tunnels ?? []),
  ]) {
    if (ids.has(item.id)) fail('level', `duplicate id "${item.id}"`);
    ids.add(item.id);
  }
  if (level.exit && 'id' in level.exit && ids.has(level.exit.id))
    fail('level.exit.id', `duplicate id "${level.exit.id}"`);
  if (json.theme !== undefined) levelThemes.set(level, json.theme as LevelTheme);
  return level;
}

function patroller(raw: Record<string, unknown>, path: string): PatrollerDef {
  const position = point(raw.position, `${path}.position`);
  const size = point(raw.size, `${path}.size`);
  if (size.x <= 0 || size.y <= 0) fail(`${path}.size`, 'full width and height must be positive');
  const rawStomp = raw.stomp as Record<string, unknown>;
  const stomp = {
    minDownSpeed: num(rawStomp.minDownSpeed, `${path}.stomp.minDownSpeed`),
    reboundSpeed: num(rawStomp.reboundSpeed, `${path}.stomp.reboundSpeed`),
    topInset: num(rawStomp.topInset, `${path}.stomp.topInset`),
  };
  if (stomp.topInset * 2 >= size.x)
    fail(`${path}.stomp.topInset`, 'must leave a nonzero vulnerable top span');
  const base = { id: str(raw.id, `${path}.id`), kind: 'patroller' as const, position, size, stomp };
  if (!isRecord(raw.path)) return base;
  const to = point(raw.path.to, `${path}.path.to`);
  if (to.y !== position.y) fail(`${path}.path.to`, 'patroller path must be horizontal');
  const period = num(raw.path.period, `${path}.path.period`);
  if (anchorPathPeaks(position, to, period).speed > 3)
    fail(`${path}.path`, 'peak patrol speed exceeds 3 m/s');
  const phase =
    raw.path.phase === undefined ? undefined : num(raw.path.phase, `${path}.path.phase`);
  return { ...base, path: { to, period, ...(phase === undefined ? {} : { phase }) } };
}

function compileExit(raw: Record<string, unknown>): NonNullable<LevelDef['exit']> {
  const box = region(raw, 'level.exit');
  if (raw.family === undefined) return box;
  const family = raw.family as 'wide' | 'slot' | 'shaft';
  const entry = raw.entry as Record<string, unknown>;
  const side = entry.side as 'left' | 'right' | 'top' | 'bottom';
  if (family === 'slot' && side !== 'left' && side !== 'right')
    fail('level.exit.entry.side', 'slot exits require left or right entry');
  if (family === 'shaft' && side !== 'top' && side !== 'bottom')
    fail('level.exit.entry.side', 'shaft exits require top or bottom entry');
  const window = (key: string): { min: number; max: number } => {
    const rawWindow = entry[key] as Record<string, unknown>;
    const min = num(rawWindow.min, `level.exit.entry.${key}.min`);
    const max = num(rawWindow.max, `level.exit.entry.${key}.max`);
    if (min > max) fail(`level.exit.entry.${key}`, 'min must not exceed max');
    return { min, max };
  };
  return {
    ...box,
    id: str(raw.id, 'level.exit.id'),
    family,
    entry: {
      side,
      angle: window('angle'),
      ...(entry.speed === undefined ? {} : { speed: window('speed') }),
      alignment: window('alignment'),
    },
  };
}

function region(v: unknown, path: string): { min: Vec2; max: Vec2 } {
  if (!isRecord(v)) fail(path, 'must be an object');
  const min = point(v.min, `${path}.min`);
  const max = point(v.max, `${path}.max`);
  if (min.x >= max.x || min.y >= max.y) fail(path, 'min must be below max on both axes');
  return { min, max };
}

function entries(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

function authoringMetadata(json: AuthoringLevelV2): Partial<LevelDef> {
  return {
    telemetry: {
      levelId: str(
        isRecord(json.telemetry) ? json.telemetry.levelId : undefined,
        'level.telemetry.levelId',
      ),
    },
    ...(json.section === undefined ? {} : { section: str(json.section, 'level.section') }),
    ...(json.chambers === undefined
      ? {}
      : {
          chambers: entries(json.chambers).map((c, i) => ({
            id: str(c.id, `level.chambers[${String(i)}].id`),
            region: region(c.region, `level.chambers[${String(i)}].region`),
            problem: str(c.problem, `level.chambers[${String(i)}].problem`),
            challengeFamily: str(c.challengeFamily, `level.chambers[${String(i)}].challengeFamily`),
          })),
        }),
    ...(json.checkpoints === undefined
      ? {}
      : {
          checkpoints: entries(json.checkpoints).map((c, i) => ({
            id: str(c.id, `level.checkpoints[${String(i)}].id`),
            position: point(c.position, `level.checkpoints[${String(i)}].position`),
          })),
        }),
    ...(json.cameraHints === undefined
      ? {}
      : {
          cameraHints: entries(json.cameraHints).map((c, i) => ({
            id: str(c.id, `level.cameraHints[${String(i)}].id`),
            region: region(c.region, `level.cameraHints[${String(i)}].region`),
            focus: point(c.focus, `level.cameraHints[${String(i)}].focus`),
          })),
        }),
    ...(json.tunnels === undefined
      ? {}
      : {
          tunnels: entries(json.tunnels).map((c, i) => ({
            id: str(c.id, `level.tunnels[${String(i)}].id`),
            region: region(c.region, `level.tunnels[${String(i)}].region`),
          })),
        }),
  };
}

/** Backward-compatible loader entry point. */
export const parseLevel: (source: unknown) => LevelDef = compileLevel;
