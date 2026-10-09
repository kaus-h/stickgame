import { dcos, type Vec2 } from '../core';
import type { ExitDef, ExitFamily, ExitSide } from './level';

export interface ExitAttempt {
  readonly exitId: string;
  readonly family: ExitFamily;
  readonly at: Vec2;
  readonly velocity: Vec2;
  readonly speed: number;
  readonly angleCos: number;
  readonly alignment: number;
  readonly accepted: boolean;
  readonly reason: 'angle' | 'speed' | 'alignment' | 'wrong-side' | 'clearance' | null;
}

/** Evaluate the first inward boundary crossing on the fixed-tick trajectory chord. */
export function evaluateExitEntry(
  exit: ExitDef,
  from: Vec2,
  to: Vec2,
  velocity: Vec2,
  radius: number,
): ExitAttempt | null {
  const { min, max } = exit;
  if (from.x > min.x && from.x < max.x && from.y > min.y && from.y < max.y) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let crossing: { side: ExitSide; t: number; at: Vec2 } | null = null;
  const candidate = (side: ExitSide, distance: number, delta: number, inward: boolean) => {
    if (!inward || delta === 0) return;
    const t = distance / delta;
    if (t < 0 || t > 1) return;
    const at = { x: from.x + dx * t, y: from.y + dy * t };
    if (
      at.x < min.x - 1e-10 ||
      at.x > max.x + 1e-10 ||
      at.y < min.y - 1e-10 ||
      at.y > max.y + 1e-10
    )
      return;
    if (!crossing || t < crossing.t) crossing = { side, t, at };
  };
  candidate('left', min.x - from.x, dx, from.x < min.x && dx > 0);
  candidate('right', max.x - from.x, dx, from.x > max.x && dx < 0);
  candidate('top', min.y - from.y, dy, from.y < min.y && dy > 0);
  candidate('bottom', max.y - from.y, dy, from.y > max.y && dy < 0);
  // Assignment happens in candidate, so explicitly preserve its narrowed result for TypeScript.
  const hit = crossing as { side: ExitSide; t: number; at: Vec2 } | null;
  if (!hit) return null;
  const side = exit.entry.side;
  const horizontal = side === 'left' || side === 'right';
  const start = horizontal ? min.y : min.x;
  const end = horizontal ? max.y : max.x;
  const coordinate = horizontal ? hit.at.y : hit.at.x;
  const alignment = (coordinate - start) / (end - start);
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
  const inwardSpeed =
    side === 'left'
      ? velocity.x
      : side === 'right'
        ? -velocity.x
        : side === 'top'
          ? velocity.y
          : -velocity.y;
  const angleCos = speed > 0 ? inwardSpeed / speed : 0;
  const { entry } = exit;
  const eps = 1e-10;
  let reason: ExitAttempt['reason'] = null;
  if (hit.side !== side || inwardSpeed <= 0) reason = 'wrong-side';
  else if (coordinate - radius < start - eps || coordinate + radius > end + eps)
    reason = 'clearance';
  else if (
    angleCos < dcos((entry.angle.max * Math.PI) / 180) - eps ||
    angleCos > dcos((entry.angle.min * Math.PI) / 180) + eps
  )
    reason = 'angle';
  else if (
    entry.speed &&
    (speed < entry.speed.min - eps || speed > entry.speed.max + eps)
  )
    reason = 'speed';
  else if (alignment < entry.alignment.min - eps || alignment > entry.alignment.max + eps)
    reason = 'alignment';
  return {
    exitId: exit.id,
    family: exit.family,
    at: hit.at,
    velocity,
    speed,
    angleCos,
    alignment,
    accepted: reason === null,
    reason,
  };
}
