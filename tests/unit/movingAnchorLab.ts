/**
 * GMR-26 measurement harness for moving anchors. Test-only code (not part of the sim), so it may
 * use Math.sin/cos/atan2 for the reference integrator.
 */
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../src/content';
import { SIM_DT, vec2, type Intent, type Vec2 } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { Simulation, type LevelDef, type SimSnapshot } from '../../src/sim';

export const tuning = parseRuntimeTuning(runtimeJson).sim;
export const g = tuning.gravity;

export interface PathSpec {
  /** Peak-to-peak travel, m. */
  readonly span: number;
  readonly period: number;
  readonly axis: 'x' | 'y';
  readonly phase?: number;
}

export const peakSpeed = (p: PathSpec): number => (Math.PI * p.span) / p.period;
export const peakAccel = (p: PathSpec): number => (p.span / 2) * ((2 * Math.PI) / p.period) ** 2;

/** Open space: one anchor at the origin (moving along `path`), nothing to collide with. */
export function openLevel(path: PathSpec | null, spawn: Vec2): LevelDef {
  return {
    id: 'moving-lab-test',
    name: 'moving lab test',
    spawn,
    bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    killY: 1e6,
    solids: [],
    anchors: [
      {
        id: 'mover',
        position: vec2(0, 0),
        radius: 0.4,
        ...(path
          ? {
              path: {
                to: path.axis === 'x' ? vec2(path.span, 0) : vec2(0, path.span),
                period: path.period,
                ...(path.phase === undefined ? {} : { phase: path.phase }),
              },
            }
          : {}),
      },
    ],
  };
}

export function makeSim(level: LevelDef): Simulation {
  return new Simulation(tuning, new KinematicPhysicsAdapter(), level);
}

/** Step `ticks` times with no input except (on `attachAt`) an aim at anchor 0 and a press. */
export function stepUntil(sim: Simulation, attachAt: number): SimSnapshot {
  while (sim.snapshot().attemptTick < attachAt) sim.step([]);
  const a = sim.snapshot().anchors[0] as Vec2;
  const intents: Intent[] = [{ type: 'ropeAim', target: a }, { type: 'ropePress' }];
  sim.step(intents);
  return sim.snapshot();
}

export interface SwingTrace {
  /** Per tick after attach: world-frame energy per unit mass. */
  readonly worldE: number[];
  /** Per tick: energy in the (translating) anchor frame. */
  readonly frameE: number[];
  /** Per tick: rope angle from straight down, rad (+ = player right of the pivot). */
  readonly theta: number[];
  /** Max (distance - length) while attached, m. */
  readonly maxStretch: number;
  /** Ticks the locked rope was not taut. */
  readonly slackTicks: number;
  readonly length: number;
  readonly attach: SimSnapshot;
  readonly last: SimSnapshot;
}

const energy = (p: Vec2, v: Vec2): number => 0.5 * (v.x * v.x + v.y * v.y) - g * p.y;

/** Attach on `attachAt`, then hang on for `ticks` with no input. */
export function swing(level: LevelDef, attachAt: number, ticks: number): SwingTrace {
  const sim = makeSim(level);
  const attach = stepUntil(sim, attachAt);
  if (!attach.rope?.locked) throw new Error('rope did not lock at attach');
  const L = attach.rope.length;
  const worldE: number[] = [];
  const frameE: number[] = [];
  const theta: number[] = [];
  let maxStretch = -Infinity;
  let slackTicks = 0;
  let s = attach;
  for (let i = 0; i <= ticks; i++) {
    if (i > 0) {
      sim.step([]);
      s = sim.snapshot();
    }
    const rope = s.rope;
    if (!rope) throw new Error('rope lost');
    const va = s.anchorVelocities[0] as Vec2;
    const rx = s.player.position.x - rope.point.x;
    const ry = s.player.position.y - rope.point.y;
    maxStretch = Math.max(maxStretch, Math.sqrt(rx * rx + ry * ry) - L);
    if (!rope.taut) slackTicks++;
    worldE.push(energy(s.player.position, s.player.velocity));
    frameE.push(
      0.5 * ((s.player.velocity.x - va.x) ** 2 + (s.player.velocity.y - va.y) ** 2) - g * ry,
    );
    theta.push(Math.atan2(rx, ry));
  }
  return { worldE, frameE, theta, maxStretch, slackTicks, length: L, attach, last: s };
}

/**
 * Reference: an ideal rigid pendulum on the same scripted pivot, RK4 with 64 substeps per tick.
 * θ'' = -(g·sinθ + a_x·cosθ - a_y·sinθ) / L. Starts from the sim state on the attach tick.
 */
export function reference(
  path: PathSpec,
  trace: SwingTrace,
  ticks: number,
): { theta: number[]; frameE: number[] } {
  const L = trace.length;
  const s = trace.attach;
  const rope = s.rope as NonNullable<SimSnapshot['rope']>;
  const va = s.anchorVelocities[0] as Vec2;
  const rx = s.player.position.x - rope.point.x;
  const ry = s.player.position.y - rope.point.y;
  let th = Math.atan2(rx, ry);
  let om =
    ((s.player.velocity.x - va.x) * Math.cos(th) - (s.player.velocity.y - va.y) * Math.sin(th)) / L;
  const w = (2 * Math.PI) / path.period;
  const half = path.span / 2;
  const phase = path.phase ?? 0;
  const acc = (t: number): number => half * w * w * Math.cos(w * (t + phase * path.period));
  const f = (t: number, a: number, o: number): [number, number] => {
    const pa = acc(t);
    const ax = path.axis === 'x' ? pa : 0;
    const ay = path.axis === 'y' ? pa : 0;
    return [o, -(g * Math.sin(a) + ax * Math.cos(a) - ay * Math.sin(a)) / L];
  };
  const n = 64;
  const h = SIM_DT / n;
  let t = s.attemptTick * SIM_DT;
  const out = [th];
  const frameE = [0.5 * L * L * om * om - g * L * Math.cos(th)];
  for (let i = 0; i < ticks; i++) {
    for (let k = 0; k < n; k++) {
      const [k1a, k1o] = f(t, th, om);
      const [k2a, k2o] = f(t + h / 2, th + (h / 2) * k1a, om + (h / 2) * k1o);
      const [k3a, k3o] = f(t + h / 2, th + (h / 2) * k2a, om + (h / 2) * k2o);
      const [k4a, k4o] = f(t + h, th + h * k3a, om + h * k3o);
      th += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
      om += (h / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
      t += h;
    }
    out.push(th);
    frameE.push(0.5 * L * L * om * om - g * L * Math.cos(th));
  }
  return { theta: out, frameE };
}

export const range = (xs: readonly number[]): number => Math.max(...xs) - Math.min(...xs);
export const maxAbsDiff = (a: readonly number[], b: readonly number[], n = a.length): number => {
  let m = 0;
  for (let i = 0; i < Math.min(n, a.length, b.length); i++) {
    m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  }
  return m;
};

/**
 * Release-velocity map: attach on each tick in [from, to], release `hold` ticks later. Returns the
 * release velocity per attach tick.
 */
export function releaseMap(level: LevelDef, from: number, to: number, hold: number): Vec2[] {
  const out: Vec2[] = [];
  for (let k = from; k <= to; k++) {
    const sim = makeSim(level);
    stepUntil(sim, k);
    for (let i = 1; i < hold; i++) sim.step([]);
    sim.step([{ type: 'ropeRelease' }]);
    out.push(sim.snapshot().player.velocity);
  }
  return out;
}

/**
 * Finite-time sensitivity: two runs whose spawn differs by `eps` metres, attached on tick 0 and
 * released after `hold` ticks. Returns |Δ release velocity| / eps, (m/s) per m. A learnable swing
 * keeps this modest; a chaotic one grows it exponentially with `hold`.
 */
export function sensitivity(path: PathSpec | null, spawn: Vec2, hold: number, eps = 1e-4): number {
  const run = (s: Vec2): Vec2 => {
    const sim = makeSim(openLevel(path, s));
    stepUntil(sim, 0);
    for (let i = 1; i < hold; i++) sim.step([]);
    sim.step([{ type: 'ropeRelease' }]);
    return sim.snapshot().player.velocity;
  };
  const a = run(spawn);
  const b = run(vec2(spawn.x + eps, spawn.y));
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / eps;
}

/** Largest velocity change between neighbouring entries, m/s. */
export function maxNeighbourJump(vs: readonly Vec2[]): number {
  let m = 0;
  for (let i = 1; i < vs.length; i++) {
    const a = vs[i - 1] as Vec2;
    const b = vs[i] as Vec2;
    m = Math.max(m, Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
  }
  return m;
}

/** Largest second difference (kink) between neighbouring entries, m/s. */
export function maxKink(vs: readonly Vec2[]): number {
  let m = 0;
  for (let i = 2; i < vs.length; i++) {
    const a = vs[i - 2] as Vec2;
    const b = vs[i - 1] as Vec2;
    const c = vs[i] as Vec2;
    m = Math.max(m, Math.sqrt((a.x - 2 * b.x + c.x) ** 2 + (a.y - 2 * b.y + c.y) ** 2));
  }
  return m;
}
