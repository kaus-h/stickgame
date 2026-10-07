import type { Vec2 } from '../core';
import type { Segment } from '../physics';

/** A closed polygon of level geometry. Hazard solids kill on contact (lethal floor, thorns). */
export interface SolidDef {
  readonly id: string;
  readonly kind: 'solid' | 'hazard';
  readonly points: readonly Vec2[];
}

/**
 * A rope anchor: a ring whose disc is the impact geometry. Where the aim lands on the disc is the
 * mechanical impact point (doc 04: selection tolerance is separate from the impact point).
 * With `path`, it moves back and forth between `position` and `path.to` (see anchorPath.ts).
 */
export interface AnchorDef {
  readonly id: string;
  readonly position: Vec2;
  /** Impact disc radius, m. */
  readonly radius: number;
  readonly path?: AnchorPathDef;
}

/** Smooth ping-pong path. Limits on peak speed and acceleration: docs/moving-anchors.md. */
export interface AnchorPathDef {
  readonly to: Vec2;
  /** Full there-and-back cycle, s. */
  readonly period: number;
  /** Start offset in the cycle, 0..1 (default 0 = at `position`, at rest). */
  readonly phase?: number;
}

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly spawn: Vec2;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  /** Falling below this y kills (out of bounds). */
  readonly killY: number;
  readonly solids: readonly SolidDef[];
  readonly anchors: readonly AnchorDef[];
  /** Entering this box completes the level (compartment exits replace it in GMR-46). */
  readonly exit?: { readonly min: Vec2; readonly max: Vec2 };
}

/** Polygon edges become physics segments. */
export function levelSegments(level: LevelDef): Segment[] {
  const out: Segment[] = [];
  for (const solid of level.solids) {
    const n = solid.points.length;
    for (let i = 0; i < n; i++) {
      const a = solid.points[i] as Vec2;
      const b = solid.points[(i + 1) % n] as Vec2;
      out.push({ a, b, kind: solid.kind });
    }
  }
  return out;
}
