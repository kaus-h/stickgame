import type { LevelDef, SimEvent } from '../sim';

export interface ExitTelemetryEvent {
  readonly name: 'exit_miss' | 'exit_success';
  readonly props: Readonly<Record<string, string | number | boolean>>;
}

/** Portable data only; the composition root chooses the platform analytics transport. */
export function exitTelemetry(level: LevelDef, event: SimEvent): ExitTelemetryEvent | null {
  if (event.type !== 'exitMiss' && event.type !== 'exit') return null;
  const attempt = event.attempt;
  if (!attempt) return null;
  const chamber = level.chambers?.find(
    ({ region }) =>
      attempt.at.x >= region.min.x &&
      attempt.at.x <= region.max.x &&
      attempt.at.y >= region.min.y &&
      attempt.at.y <= region.max.y,
  );
  return {
    name: attempt.accepted ? 'exit_success' : 'exit_miss',
    props: {
      levelId: level.telemetry?.levelId ?? level.id,
      chamberId: chamber?.id ?? 'none',
      exitId: attempt.exitId,
      family: attempt.family,
      tick: event.tick,
      x: attempt.at.x,
      y: attempt.at.y,
      vx: attempt.velocity.x,
      vy: attempt.velocity.y,
      speed: attempt.speed,
      angleCos: attempt.angleCos,
      alignment: attempt.alignment,
      accepted: attempt.accepted,
      reason: attempt.reason ?? 'accepted',
    },
  };
}
