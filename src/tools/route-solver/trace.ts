import { BUILD_HASH, decodeReplay, ReplayIntentSource, type Vec2 } from '../../core';
import type { RuntimeTuning } from '../../content';
import type { LevelDef } from '../../sim';
import { World } from './world';

/** One tick of a traced route: where the player is and, if tethered, where the rope is fixed. */
export interface TracePoint {
  readonly tick: number;
  readonly at: Vec2;
  readonly rope: Vec2 | null;
  readonly died: boolean;
}

/**
 * Replay a solution file's route from tick 0 and record the player's path (level design review,
 * `npm run levels:plot`). Read-only: it runs the same headless simulation as the solver.
 */
export function traceSolution(
  level: LevelDef,
  tuning: RuntimeTuning,
  replay: string,
): TracePoint[] {
  const decoded = decodeReplay(replay, BUILD_HASH).replay;
  const source = new ReplayIntentSource(decoded);
  const world = World.create(level, tuning);
  const out: TracePoint[] = [];
  while (world.tick < decoded.ticks) {
    const tick = world.tick;
    const events = world.step({ intents: (t) => source.poll(t) });
    const snap = world.sim.snapshot();
    out.push({
      tick,
      at: snap.player.position,
      rope: snap.rope ? snap.rope.point : null,
      died: events.some((e) => e.type === 'death'),
    });
  }
  return out;
}
