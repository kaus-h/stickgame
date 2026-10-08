import type { LevelDef, SimEvent } from '../sim';

export interface EnemyTelemetryEvent {
  readonly name: 'enemy_stomp' | 'enemy_contact_death';
  readonly props: Readonly<Record<string, string | number | boolean>>;
}

/** Contact data survives reset; the composition root supplies the analytics transport. */
export function enemyTelemetry(level: LevelDef, event: SimEvent): EnemyTelemetryEvent | null {
  if (event.type !== 'stomp' && !(event.type === 'death' && event.cause === 'enemy-contact'))
    return null;
  const chamber = level.chambers?.find(
    ({ region }) =>
      event.at.x >= region.min.x &&
      event.at.x <= region.max.x &&
      event.at.y >= region.min.y &&
      event.at.y <= region.max.y,
  );
  const contact = {
    levelId: level.telemetry?.levelId ?? level.id,
    chamberId: chamber?.id ?? 'none',
    enemyId: event.enemy ?? 'unknown',
    tick: event.tick,
    x: event.at.x,
    y: event.at.y,
    vx: event.velocity.x,
    vy: event.velocity.y,
  };
  return event.type === 'stomp'
    ? {
        name: 'enemy_stomp',
        props: { ...contact, reboundVx: event.rebound.x, reboundVy: event.rebound.y },
      }
    : {
        name: 'enemy_contact_death',
        props: { ...contact, cause: event.cause, attemptTicks: event.attemptTicks },
      };
}
