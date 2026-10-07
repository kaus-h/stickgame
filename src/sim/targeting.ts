import { distance, vec2, type Vec2 } from '../core';
import type { RayHit } from '../physics';
import type { RopeTuning } from './tuning';

export type RopeInvalidReason = 'no-anchor' | 'too-far' | 'too-close' | 'blocked';

/** An anchor as targeting sees it this tick. */
export interface TargetAnchor {
  readonly position: Vec2;
  readonly radius: number;
}

/**
 * The result of resolving an aim point against the anchors (GMR-21). Valid results carry
 * everything needed to connect: rope length is `distance`, fixed at connection (doc 04).
 */
export type TargetResolution =
  | {
      readonly valid: true;
      readonly anchor: number;
      /** Mechanical impact point in world space. */
      readonly impact: Vec2;
      /** Impact point relative to the anchor centre (moving anchors carry it along). */
      readonly offset: Vec2;
      /** Player reference point to impact point, m. */
      readonly distance: number;
    }
  | {
      readonly valid: false;
      readonly reason: RopeInvalidReason;
      readonly anchor: number | null;
      readonly impact: Vec2 | null;
      readonly distance: number | null;
    };

/** Below this, a ray hit counts as reaching the impact point rather than being blocked. */
const LOS_EPSILON = 1e-6;

/**
 * Resolve an aim point. Selection is forgiving: any anchor whose disc lies within `selectRadius`
 * of the aim is a candidate, and the closest disc wins (ties: closer centre, then lower index).
 * The impact point is still exact: the aim point itself when it is on the disc, otherwise the
 * nearest point on the disc rim. There is no fixed centre-point grapple and no auto-targeting:
 * aim far from every anchor and nothing is selected.
 */
export function resolveTarget(
  player: Vec2,
  aim: Vec2,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: (from: Vec2, to: Vec2) => RayHit | null,
): TargetResolution {
  let best = -1;
  let bestGap = Infinity;
  let bestCentre = Infinity;
  anchors.forEach((a, i) => {
    const d = distance(aim, a.position);
    const gap = Math.max(0, d - a.radius);
    if (gap > rope.selectRadius) return;
    if (gap < bestGap || (gap === bestGap && d < bestCentre)) {
      best = i;
      bestGap = gap;
      bestCentre = d;
    }
  });

  if (best < 0)
    return { valid: false, reason: 'no-anchor', anchor: null, impact: null, distance: null };

  const a = anchors[best] as TargetAnchor;
  const dx = aim.x - a.position.x;
  const dy = aim.y - a.position.y;
  const k = bestCentre > a.radius ? a.radius / bestCentre : 1;
  const offset = vec2(dx * k, dy * k);
  const impact = vec2(a.position.x + offset.x, a.position.y + offset.y);
  const length = distance(player, impact);

  const invalid = (reason: RopeInvalidReason): TargetResolution => ({
    valid: false,
    reason,
    anchor: best,
    impact,
    distance: length,
  });
  if (length < rope.minLength) return invalid('too-close');
  if (length > rope.maxLength) return invalid('too-far');
  const hit = raycast(player, impact);
  if (hit && hit.distance < length - LOS_EPSILON) return invalid('blocked');

  return { valid: true, anchor: best, impact, offset, distance: length };
}
