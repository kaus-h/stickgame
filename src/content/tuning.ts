import type { SimTuning } from '../sim';

/** Central runtime tuning (content/tuning/runtime.json). The step size itself is fixed at SIM_DT. */
export interface RuntimeTuning {
  readonly clock: { readonly maxStepsPerFrame: number; readonly maxFrameDelta: number };
  readonly sim: SimTuning;
  /** Radii for the opt-in aim-assist tiers (GMR-27). The tier itself is a player setting. */
  readonly assist: AssistTuning;
}

/** PROTOTYPE REQUIRED (GMR-27/33): set on devices with the touch lab. */
export interface AssistTuning {
  /** Selection radius for the `wide-select` tier, m. */
  readonly wideSelectRadius: number;
  /** Snap radius for the `snap` tier, m. */
  readonly snapRadius: number;
}

/** Used when a tuning file predates the assist section. */
export const DEFAULT_ASSIST_TUNING: AssistTuning = { wideSelectRadius: 1.8, snapRadius: 2.6 };

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

/** Validate untrusted JSON into RuntimeTuning; throws TuningError with the offending path. */
export function parseRuntimeTuning(json: unknown): RuntimeTuning {
  if (!isRecord(json)) throw new TuningError('tuning must be an object');
  const clock = rec(json, 'clock', 'tuning');
  const sim = rec(json, 'sim', 'tuning');
  const player = rec(sim, 'player', 'tuning.sim');
  const rope = rec(sim, 'rope', 'tuning.sim');
  const P = 'tuning.sim.player';
  const R = 'tuning.sim.rope';
  const assist = json.assist === undefined ? null : rec(json, 'assist', 'tuning');

  return {
    clock: {
      maxStepsPerFrame: num(clock, 'maxStepsPerFrame', 'tuning.clock', 1),
      maxFrameDelta: num(clock, 'maxFrameDelta', 'tuning.clock', 0),
    },
    sim: {
      gravity: num(sim, 'gravity', 'tuning.sim', 0),
      physicsSubsteps: num(sim, 'physicsSubsteps', 'tuning.sim', 1),
      player: {
        radius: num(player, 'radius', P, 0.05),
        runSpeed: num(player, 'runSpeed', P, 0),
        groundAccel: num(player, 'groundAccel', P, 0),
        groundDecel: num(player, 'groundDecel', P, 0),
        airAccel: num(player, 'airAccel', P, 0),
        airMaxSpeed: num(player, 'airMaxSpeed', P, 0),
        jumpSpeed: num(player, 'jumpSpeed', P, 0),
        jumpCut: num(player, 'jumpCut', P, 0),
        fallGravityScale: num(player, 'fallGravityScale', P, 0),
        maxFallSpeed: num(player, 'maxFallSpeed', P, 0),
        coyoteTicks: num(player, 'coyoteTicks', P, 0),
        jumpBufferTicks: num(player, 'jumpBufferTicks', P, 0),
      },
      rope: {
        minLength: num(rope, 'minLength', R, 0),
        maxLength: num(rope, 'maxLength', R, 0),
        selectRadius: num(rope, 'selectRadius', R, 0),
        stickinessDistance:
          rope.stickinessDistance === undefined ? 0.5 : num(rope, 'stickinessDistance', R, 0),
        stickinessAngleDegrees:
          rope.stickinessAngleDegrees === undefined
            ? 12
            : num(rope, 'stickinessAngleDegrees', R, 0),
        steerAccel: num(rope, 'steerAccel', R, 0),
        steerEnergyHeight: num(rope, 'steerEnergyHeight', R, 0),
        catchRetention: num(rope, 'catchRetention', R, 0),
      },
    },
    assist: assist
      ? {
          wideSelectRadius: num(assist, 'wideSelectRadius', 'tuning.assist', 0),
          snapRadius: num(assist, 'snapRadius', 'tuning.assist', 0),
        }
      : DEFAULT_ASSIST_TUNING,
  };
}
