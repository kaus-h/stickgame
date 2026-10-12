import { distance, vec2, type AssistMode, type Vec2 } from '../core';
import type { RayHit } from '../physics';
import type { RopeTuning } from './tuning';

export type RopeInvalidReason = 'no-anchor' | 'too-far' | 'too-close' | 'blocked';

/** An anchor as targeting sees it this tick. */
export interface TargetAnchor {
  readonly position: Vec2;
  readonly radius: number;
  /** False for a timed anchor in its off span or a spent one-use anchor (GMR-60): never selected. */
  readonly usable?: boolean;
}

/**
 * Explicit aim-assist configuration (GMR-27). `standard` ignores the radii, so the canonical
 * selection rule is untouched unless a player opts in. Radii come from content tuning.
 */
export interface TargetAssist {
  readonly mode: AssistMode;
  /** Selection radius used by `wide-select`, m (never smaller than rope.selectRadius). */
  readonly wideSelectRadius: number;
  /** Fallback snap radius used by `snap` when nothing is inside rope.selectRadius, m. */
  readonly snapRadius: number;
}

export const STANDARD_ASSIST: TargetAssist = {
  mode: 'standard',
  wideSelectRadius: 0,
  snapRadius: 0,
};

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
      /** Selected by the `snap` assist (outside the standard radius): render must show it. */
      readonly snapped: boolean;
    }
  | {
      readonly valid: false;
      readonly reason: RopeInvalidReason;
      readonly anchor: number | null;
      readonly impact: Vec2 | null;
      readonly distance: number | null;
      readonly snapped: boolean;
    };

/** Below this, a ray hit counts as reaching the impact point rather than being blocked. */
const LOS_EPSILON = 1e-6;

/**
 * Resolve an aim point. Selection is forgiving: any anchor whose disc lies within `selectRadius`
 * of the aim is a candidate, and the closest disc wins (ties: closer centre, then lower index).
 * The impact point is still exact: the aim point itself when it is on the disc, otherwise the
 * nearest point on the disc rim. There is no fixed centre-point grapple and no auto-targeting:
 * aim far from every anchor and nothing is selected.
 *
 * Assists (explicit, opt-in): `wide-select` widens the selection radius; `snap` falls back to the
 * nearest anchor within `snapRadius` when nothing is inside the standard radius and flags the
 * result `snapped` so the snap is drawn. Under `standard` the result is exactly the canonical one.
 */
export function resolveTarget(
  player: Vec2,
  aim: Vec2,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: (from: Vec2, to: Vec2) => RayHit | null,
  assist: TargetAssist = STANDARD_ASSIST,
): TargetResolution {
  const select =
    assist.mode === 'wide-select'
      ? Math.max(rope.selectRadius, assist.wideSelectRadius)
      : rope.selectRadius;
  let { best, bestCentre } = closest(aim, anchors, select);
  let snapped = false;
  if (best < 0 && assist.mode === 'snap' && assist.snapRadius > select) {
    ({ best, bestCentre } = closest(aim, anchors, assist.snapRadius));
    snapped = best >= 0;
  }

  if (best < 0)
    return {
      valid: false,
      reason: 'no-anchor',
      anchor: null,
      impact: null,
      distance: null,
      snapped: false,
    };

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
    snapped,
  });
  if (length < rope.minLength) return invalid('too-close');
  if (length > rope.maxLength) return invalid('too-far');
  const hit = raycast(player, impact);
  if (hit && hit.distance < length - LOS_EPSILON) return invalid('blocked');

  return { valid: true, anchor: best, impact, offset, distance: length, snapped };
}

/** Closest anchor disc within `radius` of the aim (ties: closer centre, then lower index). */
function closest(
  aim: Vec2,
  anchors: readonly TargetAnchor[],
  radius: number,
): { best: number; bestCentre: number } {
  let best = -1;
  let bestGap = Infinity;
  let bestCentre = Infinity;
  anchors.forEach((a, i) => {
    if (a.usable === false) return;
    const d = distance(aim, a.position);
    const gap = Math.max(0, d - a.radius);
    if (gap > radius) return;
    if (gap < bestGap || (gap === bestGap && d < bestCentre)) {
      best = i;
      bestGap = gap;
      bestCentre = d;
    }
  });
  return { best, bestCentre };
}
