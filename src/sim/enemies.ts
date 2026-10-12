import { SIM_DT, vec2, type Vec2 } from '../core';
import { anchorPathState } from './anchorPath';
import type { PatrollerDef } from './level';

export interface EnemySnapshot {
  readonly id: string;
  readonly kind: 'patroller';
  readonly position: Vec2;
  readonly size: Vec2;
  readonly velocity: Vec2;
  readonly alive: boolean;
  readonly facing: -1 | 1;
}
export interface EnemyContact {
  readonly fraction: number;
  readonly at: Vec2;
  readonly enemyAt: Vec2;
  readonly velocity: Vec2;
  readonly stomp: boolean;
}
export function patrollerState(def: PatrollerDef, time: number): EnemySnapshot {
  const state = anchorPathState({ ...def, radius: 0 }, time);
  return {
    id: def.id,
    kind: def.kind,
    size: def.size,
    ...state,
    alive: true,
    facing: state.velocity.x < 0 ? -1 : 1,
  };
}

/**
 * A downward contact is a stomp when its normal is within 60° of straight up (owner feedback,
 * 2026-10-12): landing on the top, including over its corner, is safe. Side, underside and
 * rising contacts still kill.
 */
export const STOMP_MIN_UP = 0.5;

/** Exact circle vs translating rectangle: planar faces and rounded corner arcs. */
export function sweepPatroller(
  def: PatrollerDef,
  from: Vec2,
  to: Vec2,
  velocity: Vec2,
  enemyFrom: Vec2,
  enemyTo: Vec2,
  radius: number,
  duration = SIM_DT,
): EnemyContact | null {
  const x = from.x - enemyFrom.x;
  const y = from.y - enemyFrom.y;
  const dx = to.x - from.x - (enemyTo.x - enemyFrom.x);
  const dy = to.y - from.y - (enemyTo.y - enemyFrom.y);
  const hw = def.size.x / 2;
  const hh = def.size.y / 2;
  const qx = Math.max(-hw, Math.min(hw, x));
  const qy = Math.max(-hh, Math.min(hh, y));
  const hit = { fraction: Infinity, up: 0 };
  const overlapX = x - qx;
  const overlapY = y - qy;
  const initialOverlap = overlapX * overlapX + overlapY * overlapY < radius * radius - 1e-10;
  if (initialOverlap) hit.fraction = 0;
  /** `up`: the contact normal's upward component (1 on the top face, -1 underneath). */
  const candidate = (t: number, up: number) => {
    if (t >= 0 && t <= 1 && t < hit.fraction) {
      hit.fraction = t;
      hit.up = up;
    }
  };
  if (!initialOverlap) {
    if (dy > 0) {
      const t = (-hh - radius - y) / dy;
      const atX = x + dx * t;
      if (atX >= -hw && atX <= hw) candidate(t, 1);
    }
    if (dy < 0) {
      const t = (hh + radius - y) / dy;
      const atX = x + dx * t;
      if (atX >= -hw && atX <= hw) candidate(t, -1);
    }
    if (dx > 0) {
      const t = (-hw - radius - x) / dx;
      const atY = y + dy * t;
      if (atY >= -hh && atY <= hh) candidate(t, 0);
    }
    if (dx < 0) {
      const t = (hw + radius - x) / dx;
      const atY = y + dy * t;
      if (atY >= -hh && atY <= hh) candidate(t, 0);
    }
    const aa = dx * dx + dy * dy;
    if (aa > 1e-18)
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const fx = x - sx * hw;
          const fy = y - sy * hh;
          const bb = 2 * (fx * dx + fy * dy);
          const cc = fx * fx + fy * fy - radius * radius;
          const disc = bb * bb - 4 * aa * cc;
          if (disc < 0 || bb >= 0) continue;
          const t = (-bb - Math.sqrt(disc)) / (2 * aa);
          if ((fx + dx * t) * sx >= -1e-10 && (fy + dy * t) * sy >= -1e-10)
            candidate(t, -(fy + dy * t) / radius);
        }
  }
  const { fraction, up } = hit;
  if (fraction === Infinity) return null;
  const relativeDownSpeed = velocity.y - (duration > 0 ? (enemyTo.y - enemyFrom.y) / duration : 0);
  return {
    fraction,
    at: vec2(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction),
    enemyAt: vec2(
      enemyFrom.x + (enemyTo.x - enemyFrom.x) * fraction,
      enemyFrom.y + (enemyTo.y - enemyFrom.y) * fraction,
    ),
    velocity,
    stomp:
      up >= STOMP_MIN_UP &&
      !initialOverlap &&
      relativeDownSpeed >= def.stomp.minDownSpeed &&
      relativeDownSpeed > 0,
  };
}
