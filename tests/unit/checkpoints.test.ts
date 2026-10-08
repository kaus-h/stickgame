import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../src/content';
import { vec2, type Intent } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { hashSnapshot, Simulation, type LevelDef, type SimEvent } from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson).sim;
const box = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'solid' | 'hazard' = 'solid',
) => ({
  id,
  kind,
  points: [vec2(x, y), vec2(x + w, y), vec2(x + w, y + h), vec2(x, y + h)],
});

/** A long floor with two checkpoints, then a pit of lava. */
const level: LevelDef = {
  id: 'cp-test',
  name: 'cp',
  spawn: vec2(1, 7.65),
  bounds: { minX: 0, minY: -5, maxX: 60, maxY: 12 },
  killY: 14,
  solids: [box('floor', 0, 8, 30, 2), box('lava', 30, 11, 30, 1, 'hazard')],
  anchors: [],
  checkpoints: [
    { id: 'cp-a', position: vec2(10, 7.65) },
    { id: 'cp-b', position: vec2(20, 7.65) },
  ],
};

const make = () => new Simulation(tuning, new KinematicPhysicsAdapter(), level);
const run = (sim: Simulation, n: number, intents: Intent[] = []) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step(i === 0 ? intents : []);
    events.push(...sim.drainEvents());
  }
  return events;
};

describe('checkpoints (GMR-100)', () => {
  it('activates checkpoints in order as the player reaches them', () => {
    const sim = make();
    const events = run(sim, 240, [{ type: 'move', axis: 1 }]);
    const reached = events
      .filter((e) => e.type === 'checkpoint')
      .map((e) => (e as { id: string }).id);
    expect(reached).toEqual(['cp-a', 'cp-b']);
  });

  it('a death respawns at the last checkpoint, at rest, and the run clock keeps counting', () => {
    const sim = make();
    const events = run(sim, 600, [{ type: 'move', axis: 1 }]); // runs into the lava
    const death = events.findIndex((e) => e.type === 'death');
    expect(death).toBeGreaterThan(-1);
    expect(events.slice(death).some((e) => e.type === 'respawn')).toBe(true);
    // The state on the death tick itself: the respawn has already happened.
    const s0 = make();
    s0.step([{ type: 'move', axis: 1 }]);
    let snap = s0.snapshot();
    for (let i = 0; i < 800 && snap.deaths === 0; i++) {
      s0.step([]);
      snap = s0.snapshot();
    }
    expect(snap.checkpoint).toBe(1);
    expect(snap.player.position.x).toBeCloseTo(20, 6);
    expect(snap.player.velocity).toEqual(vec2(0, 0));
    expect(snap.attemptTick).toBe(0);
    expect(snap.runTick).toBeGreaterThan(200);
  });

  it('restart returns to the spawn and clears checkpoints and the run clock', () => {
    const sim = make();
    run(sim, 200, [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().checkpoint).toBeGreaterThanOrEqual(0);
    sim.step([{ type: 'restart' }, { type: 'move', axis: 0 }]);
    const s = sim.snapshot();
    expect(s.checkpoint).toBe(-1);
    expect(s.runTick).toBe(1);
    expect(s.player.position.x).toBeCloseTo(1, 1);
  });

  it('going back past an earlier checkpoint never moves the respawn backwards', () => {
    const sim = make();
    run(sim, 240, [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().checkpoint).toBe(1);
    run(sim, 200, [{ type: 'move', axis: -1 }]);
    expect(sim.snapshot().checkpoint).toBe(1);
  });

  it('is deterministic, and the checkpoint is part of the replay hash', () => {
    const a = make();
    const b = make();
    run(a, 700, [{ type: 'move', axis: 1 }]);
    run(b, 700, [{ type: 'move', axis: 1 }]);
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    const c = make();
    run(c, 700, [{ type: 'move', axis: 1 }]);
    c.step([{ type: 'restart' }]);
    expect(hashSnapshot(c.snapshot())).not.toBe(hashSnapshot(a.snapshot()));
  });
});
