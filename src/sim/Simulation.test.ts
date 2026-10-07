import { describe, expect, it } from 'vitest';
import { vec2 } from '../core';
import { NullPhysicsAdapter } from '../physics/backends/null/NullPhysicsAdapter';
import { Simulation } from './Simulation';
import type { SimTuning } from './tuning';

const tuning: SimTuning = {
  gravity: 25,
  physicsSubsteps: 4,
  probe: {
    start: vec2(2, 2),
    velocity: vec2(6, 0),
    bounds: { minX: 1, maxX: 14, floorY: 8 },
    restitution: 0.9,
  },
};

describe('Simulation', () => {
  it('advances one fixed step per call and steps physics with the configured substeps', () => {
    const physics = new NullPhysicsAdapter();
    const sim = new Simulation(tuning, physics);
    for (let i = 0; i < 10; i++) sim.step([]);
    expect(sim.snapshot().tick).toBe(10);
    expect(physics.stepCount).toBe(10);
  });

  it('is deterministic for the same intents', () => {
    const a = new Simulation(tuning, new NullPhysicsAdapter());
    const b = new Simulation(tuning, new NullPhysicsAdapter());
    for (let i = 0; i < 600; i++) {
      a.step([]);
      b.step([]);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('bounces off the floor and walls and reports it', () => {
    const sim = new Simulation(tuning, new NullPhysicsAdapter());
    for (let i = 0; i < 300; i++) sim.step([]);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'probeBounce' && e.surface === 'floor')).toBe(true);
    expect(events.some((e) => e.type === 'probeBounce' && e.surface === 'wall')).toBe(true);
    expect(sim.drainEvents()).toEqual([]);
  });

  it('reset returns to the initial attempt state and the restart intent triggers it', () => {
    const sim = new Simulation(tuning, new NullPhysicsAdapter());
    const initial = sim.snapshot();
    for (let i = 0; i < 90; i++) sim.step([]);
    sim.step([{ type: 'restart' }]);
    const afterRestart = sim.snapshot();
    expect(afterRestart.attemptTick).toBe(1);
    expect(afterRestart.resets).toBe(1);

    // One step after a reset matches one step from a fresh start.
    const fresh = new Simulation(tuning, new NullPhysicsAdapter());
    fresh.step([]);
    expect(afterRestart.probe).toEqual(fresh.snapshot().probe);
    expect(initial.probe.position).toEqual(tuning.probe.start);
  });
});
