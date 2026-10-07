import { SIM_DT, vec2, type Vec2 } from '../../src/core';
import type { PhysicsAdapter, Segment } from '../../src/physics';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { levelSegments, type SolidDef } from '../../src/sim';

/** Player collision radius (content/tuning/runtime.json). */
export const R = 0.35;
/** Gravity used by the lab (content/tuning/runtime.json). */
export const G = 30;
/** Production physics substeps per 60 Hz step. */
export const SUBSTEPS = 4;
/** Speeds swept by every case, m/s. Gameplay is intended to stay at or below GAMEPLAY_MAX. */
export const SPEEDS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80] as const;
export const GAMEPLAY_MAX = 30;

/** Penetration (m) above which a contact counts as visibly wrong. The solver skin is 1e-4. */
export const PEN_TOL = 2e-3;

export const rad = (deg: number): number => (deg * Math.PI) / 180;

export function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'solid' | 'hazard' = 'solid',
): SolidDef {
  return {
    id,
    kind,
    points: [vec2(x, y), vec2(x + w, y), vec2(x + w, y + h), vec2(x, y + h)],
  };
}

export function poly(
  id: string,
  pts: [number, number][],
  kind: 'solid' | 'hazard' = 'solid',
): SolidDef {
  return { id, kind, points: pts.map(([x, y]) => vec2(x, y)) };
}

export interface Row {
  /** Case name. */
  c: string;
  /** Variant label (thickness, width, length ...). */
  variant: string;
  speed: number;
  angle: number;
  ok: boolean;
  /** Short human text of what went wrong, empty when ok. */
  fail: string;
  pen: number;
  stretch: number;
  /** Fraction of speed kept, where the case defines it (NaN otherwise). */
  keep: number;
}

export const emptyRow = (c: string, variant: string, speed: number, angle: number): Row => ({
  c,
  variant,
  speed,
  angle,
  ok: true,
  fail: '',
  pen: 0,
  stretch: 0,
  keep: NaN,
});

export function flag(row: Row, why: string): void {
  row.ok = false;
  if (!row.fail.includes(why)) row.fail = row.fail ? `${row.fail}; ${why}` : why;
}

export interface Rig {
  world: PhysicsAdapter;
  solids: readonly SolidDef[];
  segments: Segment[];
  body: number;
}

export function makeRig(
  solids: readonly SolidDef[],
  position: Vec2,
  velocity: Vec2,
  gravity = G,
  radius = R,
): Rig {
  const world = new KinematicPhysicsAdapter();
  world.setGravity(vec2(0, gravity));
  const segments = levelSegments({
    id: 'x',
    name: 'x',
    spawn: position,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    killY: 1e9,
    solids,
    anchors: [],
  });
  world.setGeometry(segments);
  const body = world.createBody({ position, velocity, radius });
  return { world, solids, segments, body };
}

export const step = (rig: Rig, n = 1): void => {
  for (let i = 0; i < n; i++) rig.world.step(SIM_DT, SUBSTEPS);
};

export const pos = (rig: Rig): Vec2 => rig.world.bodyState(rig.body).position;
export const vel = (rig: Rig): Vec2 => rig.world.bodyState(rig.body).velocity;
export const speedOf = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);

export const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Distance from p to segment ab. */
export function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2)) : 0;
  return Math.sqrt((a.x + ex * t - p.x) ** 2 + (a.y + ey * t - p.y) ** 2);
}

/** Deepest overlap of a circle (center p, radius r) with any segment, 0 when clear. */
export function penetration(p: Vec2, r: number, segments: readonly Segment[]): number {
  let worst = 0;
  for (const s of segments) worst = Math.max(worst, r - segDist(p, s.a, s.b));
  return worst;
}

/** Point-in-polygon (even-odd). */
export function inside(p: Vec2, pts: readonly Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Vec2;
    const b = pts[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export const insideAny = (p: Vec2, solids: readonly SolidDef[]): boolean =>
  solids.some((s) => inside(p, s.points));

/** Specific mechanical energy (per unit mass); +y is down so height is -y. */
export const energy = (p: Vec2, v: Vec2, g = G): number => 0.5 * (v.x * v.x + v.y * v.y) - g * p.y;

/** Compact markdown-ish table of per-case pass/fail by speed, for the policy document. */
export function summarize(rows: readonly Row[]): string {
  const lines: string[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.c} | ${r.variant}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, group] of groups) {
    const cells = SPEEDS.map((s) => {
      const at = group.filter((r) => r.speed === s);
      if (at.length === 0) return '-';
      const bad = at.filter((r) => !r.ok);
      return bad.length === 0 ? 'ok' : `FAIL ${String(bad.length)}/${String(at.length)}`;
    });
    const pen = Math.max(...group.map((r) => r.pen));
    const stretch = Math.max(...group.map((r) => r.stretch));
    const first = group.find((r) => !r.ok);
    lines.push(
      `${key} | ${cells.join(' | ')} | pen ${pen.toFixed(4)} | stretch ${stretch.toFixed(4)}${
        first ? ` | ${first.fail}` : ''
      }`,
    );
  }
  return lines.join('\n');
}
