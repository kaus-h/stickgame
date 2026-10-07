import { vec2, type Vec2 } from '../core';
import type { SimTuning } from '../sim';

/** Central runtime tuning (content/tuning/runtime.json). The step size itself is fixed at SIM_DT. */
export interface RuntimeTuning {
  readonly clock: { readonly maxStepsPerFrame: number; readonly maxFrameDelta: number };
  readonly sim: SimTuning;
}

export class TuningError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(obj: Record<string, unknown>, key: string, path: string, min = -Infinity): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) {
    throw new TuningError(`${path}.${key} must be a finite number >= ${String(min)}`);
  }
  return v;
}

function rec(obj: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const v = obj[key];
  if (!isRecord(v)) throw new TuningError(`${path}.${key} must be an object`);
  return v;
}

function vec(obj: Record<string, unknown>, key: string, path: string): Vec2 {
  const v = rec(obj, key, path);
  return vec2(num(v, 'x', `${path}.${key}`), num(v, 'y', `${path}.${key}`));
}

/** Validate untrusted JSON into RuntimeTuning; throws TuningError with the offending path. */
export function parseRuntimeTuning(json: unknown): RuntimeTuning {
  if (!isRecord(json)) throw new TuningError('tuning must be an object');
  const clock = rec(json, 'clock', 'tuning');
  const sim = rec(json, 'sim', 'tuning');
  const probe = rec(sim, 'probe', 'tuning.sim');
  const bounds = rec(probe, 'bounds', 'tuning.sim.probe');

  return {
    clock: {
      maxStepsPerFrame: num(clock, 'maxStepsPerFrame', 'tuning.clock', 1),
      maxFrameDelta: num(clock, 'maxFrameDelta', 'tuning.clock', 0),
    },
    sim: {
      gravity: num(sim, 'gravity', 'tuning.sim'),
      physicsSubsteps: num(sim, 'physicsSubsteps', 'tuning.sim', 1),
      probe: {
        start: vec(probe, 'start', 'tuning.sim.probe'),
        velocity: vec(probe, 'velocity', 'tuning.sim.probe'),
        bounds: {
          minX: num(bounds, 'minX', 'tuning.sim.probe.bounds'),
          maxX: num(bounds, 'maxX', 'tuning.sim.probe.bounds'),
          floorY: num(bounds, 'floorY', 'tuning.sim.probe.bounds'),
        },
        restitution: num(probe, 'restitution', 'tuning.sim.probe', 0),
      },
    },
  };
}
