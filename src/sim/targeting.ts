import { dcos, dsin, distance, vec2, type AssistMode, type Vec2 } from '../core';
import type { RayHit } from '../physics';
import type { RopeTuning } from './tuning';

export type RopeInvalidReason = 'no-anchor' | 'too-far' | 'too-close' | 'blocked';
export interface TargetAnchor {
  readonly position: Vec2;
  readonly radius: number;
  readonly usable?: boolean;
}
/** Explicit opt-in mouse assists; every tier attaches to the same centre. */
export interface TargetAssist {
  readonly mode: AssistMode;
  readonly wideSelectRadius: number;
  readonly snapRadius: number;
}
export const STANDARD_ASSIST: TargetAssist = {
  mode: 'standard',
  wideSelectRadius: 0,
  snapRadius: 0,
};
export type TargetResolution =
  | {
      readonly valid: true;
      readonly anchor: number;
      readonly impact: Vec2;
      readonly offset: Vec2;
      readonly distance: number;
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
type ValidTarget = Extract<TargetResolution, { valid: true }>;
type Raycast = (from: Vec2, to: Vec2) => RayHit | null;
const LOS_EPSILON = 1e-6;
const miss = (): TargetResolution => ({
  valid: false,
  reason: 'no-anchor',
  anchor: null,
  impact: null,
  distance: null,
  snapped: false,
});

/** Validate a selected anchor against its current centre, never against its rim. */
export function resolveAnchor(
  player: Vec2,
  index: number,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: Raycast,
  snapped = false,
): TargetResolution {
  const a = anchors[index];
  if (!a || a.usable === false) return miss();
  const impact = a.position;
  const length = distance(player, impact);
  const invalid = (reason: RopeInvalidReason): TargetResolution => ({
    valid: false,
    reason,
    anchor: index,
    impact,
    distance: length,
    snapped,
  });
  if (length < rope.minLength) return invalid('too-close');
  if (length > rope.maxLength) return invalid('too-far');
  const hit = raycast(player, impact);
  if (hit && hit.distance < length - LOS_EPSILON) return invalid('blocked');
  return { valid: true, anchor: index, impact, offset: vec2(0, 0), distance: length, snapped };
}

/** Mouse/tap pick: nearest centre within radius+tolerance, stable ties in authored order. */
export function resolveTarget(
  player: Vec2,
  aim: Vec2,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: Raycast,
  assist: TargetAssist = STANDARD_ASSIST,
  previous: number | null = null,
): TargetResolution {
  const select =
    assist.mode === 'wide-select'
      ? Math.max(rope.selectRadius, assist.wideSelectRadius)
      : rope.selectRadius;
  let radius = select;
  let best = closest(aim, anchors, radius);
  let snapped = false;
  if (best < 0 && assist.mode === 'snap' && assist.snapRadius > select) {
    radius = assist.snapRadius;
    best = closest(aim, anchors, radius);
    snapped = best >= 0;
  }
  const bestAnchor = best < 0 ? undefined : anchors[best];
  if (!bestAnchor) return miss();
  const old = previous === null ? undefined : anchors[previous];
  if (
    old &&
    old.usable !== false &&
    distance(aim, old.position) <= old.radius + radius &&
    resolveAnchor(player, previous as number, anchors, rope, raycast).valid &&
    distance(aim, old.position) - distance(aim, bestAnchor.position) <
      (rope.stickinessDistance ?? 0.5)
  ) {
    best = previous as number;
  }
  return resolveAnchor(player, best, anchors, rope, raycast, snapped);
}

function closest(aim: Vec2, anchors: readonly TargetAnchor[], radius: number): number {
  let best = -1;
  let nearest = Infinity;
  anchors.forEach((a, i) => {
    if (a.usable === false) return;
    const d = distance(aim, a.position);
    if (d <= a.radius + radius && d < nearest) {
      best = i;
      nearest = d;
    }
  });
  return best;
}

/** Neutral's eligible pool, ordered by distance then authored index; shared with the solver. */
export function neutralCandidates(
  player: Vec2,
  facing: -1 | 1,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: Raycast,
): ValidTarget[] {
  const candidates = validCandidates(player, anchors, rope, raycast);
  const preferred = candidates.filter(
    (t) => (t.impact.x - player.x) * facing >= 0 && t.impact.y < player.y,
  );
  return preferred.length ? preferred : candidates;
}
function validCandidates(
  player: Vec2,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: Raycast,
): ValidTarget[] {
  return anchors
    .map((_, i) => resolveAnchor(player, i, anchors, rope, raycast))
    .filter((t): t is ValidTarget => t.valid)
    .sort((a, b) => a.distance - b.distance || a.anchor - b.anchor);
}

/** Right-stick point selection. Cosine comparisons avoid engine-dependent inverse trig. */
export function resolvePointTarget(
  player: Vec2,
  direction: Vec2,
  facing: -1 | 1,
  anchors: readonly TargetAnchor[],
  rope: RopeTuning,
  raycast: Raycast,
  previous: number | null = null,
): TargetResolution {
  const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  const candidates =
    magnitude === 0
      ? neutralCandidates(player, facing, anchors, rope, raycast)
      : validCandidates(player, anchors, rope, raycast);
  if (!candidates.length) return miss();
  const old = candidates.find((t) => t.anchor === previous);
  let best = candidates[0];
  if (!best) return miss();
  if (magnitude === 0) {
    if (old && old.distance - best.distance < (rope.stickinessDistance ?? 0.5)) return old;
    return best;
  }
  const cosine = (t: ValidTarget): number =>
    Math.max(
      -1,
      Math.min(
        1,
        ((t.impact.x - player.x) * direction.x + (t.impact.y - player.y) * direction.y) /
          (t.distance * magnitude),
      ),
    );
  for (const candidate of candidates) if (cosine(candidate) > cosine(best)) best = candidate;
  if (old && old.anchor !== best.anchor) {
    const angle = (Math.min(180, rope.stickinessAngleDegrees ?? 12) * Math.PI) / 180;
    const oldCos = cosine(old);
    // cos(old error - margin): a switch needs at least the full angular advantage.
    const threshold =
      oldCos * dcos(angle) + Math.sqrt(Math.max(0, 1 - oldCos * oldCos)) * dsin(angle);
    if (oldCos > dcos(angle) || cosine(best) < threshold) return old;
  }
  return best;
}
