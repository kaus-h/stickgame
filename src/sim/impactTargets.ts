import { dcos, dsin, dlen, vec2, type Vec2 } from '../core';
import { anchorPathState } from './anchorPath';
import type { TargetDef } from './level';

export interface TargetSnapshot {
  readonly id: string;
  readonly position: Vec2;
  readonly radius: number;
  readonly hp: number;
  readonly minSpeed: number;
  readonly lastImpactSpeed: number | null;
}

export function impactTargetState(def: TargetDef, time: number, minSpeed: number): TargetSnapshot {
  return {
    id: def.id,
    position: anchorPathState(def, time).position,
    radius: def.radius,
    hp: def.hp,
    minSpeed: def.minSpeed ?? minSpeed,
    lastImpactSpeed: null,
  };
}

/** Inclusive clockwise window, using deterministic trig rather than platform atan2. */
export function impactApproachAllowed(velocity: Vec2, window?: TargetDef['approach']): boolean {
  if (!window || Math.abs(window.max - window.min) === 360) return true;
  if (velocity.x === 0 && velocity.y === 0) return false;
  const width = (((window.max - window.min) % 360) + 360) % 360;
  const middle = (((window.min % 360) + width / 2) * Math.PI) / 180;
  const projection = velocity.x * dcos(middle) + velocity.y * dsin(middle);
  return projection >= dlen(velocity.x, velocity.y) * dcos((width * Math.PI) / 360) - 1e-10;
}

/** Normal points from hero to target. Exact coincident centres use arrival direction, then +x. */
export function impactContact(
  player: Vec2,
  velocity: Vec2,
  radius: number,
  target: TargetSnapshot,
) {
  const dx = target.position.x - player.x;
  const dy = target.position.y - player.y;
  const distance = dlen(dx, dy);
  const separation = radius + target.radius;
  if (distance > separation) return null;
  const speed = dlen(velocity.x, velocity.y);
  const normal =
    distance > 1e-12
      ? vec2(dx / distance, dy / distance)
      : speed > 1e-12
        ? vec2(velocity.x / speed, velocity.y / speed)
        : vec2(1, 0);
  return { normal, speed: velocity.x * normal.x + velocity.y * normal.y, separation };
}
