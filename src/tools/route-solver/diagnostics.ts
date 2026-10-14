import type { Vec2 } from '../../core';
import type { RayHit } from '../../physics';
import type { RopeTuning, TargetAnchor } from '../../sim';
import { neutralCandidates } from '../../sim/targeting';

/** Authoring warning only: explicit route aims are unchanged by neutral-default ambiguity. */
export function neutralAmbiguityNote(
  tick: number,
  player: Vec2,
  facing: -1 | 1,
  anchors: readonly TargetAnchor[],
  ids: readonly string[],
  rope: RopeTuning,
  raycast: (from: Vec2, to: Vec2) => RayHit | null,
): string | null {
  const candidates = neutralCandidates(player, facing, anchors, rope, raycast);
  const best = candidates[0];
  if (!best) return null;
  const margin = rope.stickinessDistance ?? 0.5;
  const alternatives = candidates.slice(1).filter((c) => c.distance - best.distance <= margin);
  if (alternatives.length === 0) return null;
  const name = (index: number) => ids[index] ?? String(index);
  return `Rope press tick ${String(tick)}: neutral-default anchor ${name(best.anchor)} has alternatives ${alternatives.map((c) => name(c.anchor)).join(', ')} within the ${String(margin)} m stickiness margin.`;
}
