import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../src/content';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { Simulation, hashSnapshot, type ExitDef, type LevelDef } from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson).sim;
const exit: ExitDef = {
  id: 'entry',
  family: 'slot',
  min: { x: 0, y: 0 },
  max: { x: 1, y: 2 },
  entry: {
    side: 'left',
    angle: { min: 0, max: 45 },
    speed: { min: 1, max: 200 },
    alignment: { min: 0, max: 1 },
  },
};
const level: LevelDef = {
  id: 'test',
  name: 'test',
  spawn: { x: -0.5, y: 1 },
  bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
  killY: 10,
  solids: [],
  anchors: [],
  exit,
};
function make(def = level) {
  const physics = new KinematicPhysicsAdapter();
  const sim = new Simulation(
    { ...tuning, gravity: 0, player: { ...tuning.player, maxFallSpeed: 200 } },
    physics,
    def,
  );
  return { physics, sim };
}
describe('simulation compartment lifecycle', () => {
  it.each([
    { mouth: 1.2, accepted: false },
    { mouth: 0.95, accepted: true },
  ])('admits only reachable mouth $mouth inside the active rope leash', ({ mouth, accepted }) => {
    const { sim, physics } = make({
      ...level,
      spawn: { x: 0.8, y: 0 },
      exit: { ...exit, min: { x: mouth, y: -1 }, max: { x: mouth + 1, y: 1 } },
    });
    physics.attachRope(0, { kind: 'static', point: { x: 0, y: 0 } }, 1);
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    expect(sim.snapshot().completion !== null).toBe(accepted);
    if (accepted) expect(sim.snapshot().completion?.velocity.x).toBe(160);
    else expect(sim.snapshot().lastExitAttempt).toBeNull();
    sim.dispose();
  });
  it('uses velocity at the mouth before a later floor collision removes the downward speed', () => {
    const gate: ExitDef = {
      ...exit,
      min: { x: 10, y: 7 },
      max: { x: 15, y: 8 },
      entry: { ...exit.entry, angle: { min: 0, max: 12 }, speed: { min: 3, max: 7.5 } },
    };
    const { sim, physics } = make({
      ...level,
      spawn: { x: 9.95, y: 7.5 },
      exit: gate,
      solids: [
        {
          id: 'floor',
          kind: 'solid',
          points: [
            { x: 0, y: 8 },
            { x: 18, y: 8 },
            { x: 18, y: 10 },
            { x: 0, y: 10 },
          ],
        },
      ],
    });
    physics.setBodyVelocity(0, { x: 6, y: 10 });
    sim.step([]);
    expect(sim.snapshot().player.velocity.y).toBe(0);
    expect(sim.snapshot().completion).toBeNull();
    expect(sim.snapshot().lastExitAttempt?.reason).toBe('angle');
    expect(sim.snapshot().lastExitAttempt?.velocity).toEqual({ x: 6, y: 10 });
    sim.dispose();
  });
  it('holds a high-speed accepted attempt once and clears it immediately on restart', () => {
    const { sim, physics } = make();
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    expect(sim.snapshot().completion?.exitId).toBe('entry');
    expect(sim.snapshot().player.position.x).toBeGreaterThan(1);
    expect(sim.drainEvents().filter((e) => e.type === 'exit')).toHaveLength(1);
    const completed = sim.snapshot();
    const completedHash = hashSnapshot(completed);
    expect(hashSnapshot({ ...completed, completion: null, lastExitAttempt: null })).not.toBe(
      completedHash,
    );
    sim.step([]);
    expect(sim.snapshot().tick).toBe(completed.tick + 1);
    expect(sim.snapshot().attemptTick).toBe(completed.attemptTick);
    expect(sim.snapshot().completion).toEqual(completed.completion);
    expect(sim.snapshot().player).toEqual(completed.player);
    expect(sim.drainEvents()).toEqual([]);
    sim.step([{ type: 'restart' }]);
    expect(sim.snapshot().completion).toBeNull();
    expect(sim.snapshot().lastExitAttempt).toBeNull();
    expect(sim.snapshot().player.position).toEqual(level.spawn);
    expect(sim.stats().physics.bodies).toBe(1);
    sim.dispose();
  });
  it('leaves rejected momentum untouched and does not repeat a miss while inside', () => {
    const { sim, physics } = make({
      ...level,
      exit: { ...exit, entry: { ...exit.entry, speed: { min: 100, max: 200 } } },
    });
    physics.setBodyVelocity(0, { x: 60, y: 0 });
    sim.step([]);
    expect(sim.snapshot().lastExitAttempt?.reason).toBe('speed');
    expect(sim.snapshot().player.velocity.x).toBe(60);
    expect(sim.drainEvents().filter((e) => e.type === 'exitMiss')).toHaveLength(1);
    sim.step([]);
    expect(sim.drainEvents().filter((e) => e.type === 'exitMiss')).toHaveLength(0);
    expect(sim.snapshot().completion).toBeNull();
    sim.dispose();
  });
  it('gives lethal contact priority over an entry and resets in the same tick', () => {
    const { sim, physics } = make({
      ...level,
      solids: [
        {
          id: 'spike',
          kind: 'hazard',
          points: [
            { x: 0.5, y: -2 },
            { x: 0.5, y: 4 },
            { x: 0.6, y: 4 },
          ],
        },
      ],
    });
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    expect(sim.snapshot().deaths).toBe(1);
    expect(sim.snapshot().completion).toBeNull();
    expect(sim.snapshot().player.position).toEqual(level.spawn);
    expect(sim.drainEvents().map((e) => e.type)).toEqual(['death', 'lifeEnd', 'reset']);
    sim.dispose();
  });
  it('does not cross a gate when collision blocks a high-speed approach first', () => {
    const { sim, physics } = make({
      ...level,
      spawn: { x: -2, y: 1 },
      solids: [
        {
          id: 'wall',
          kind: 'solid',
          points: [
            { x: -0.5, y: -2 },
            { x: -0.5, y: 4 },
            { x: -0.4, y: 4 },
          ],
        },
      ],
    });
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    expect(sim.snapshot().player.position.x).toBeLessThan(0);
    expect(sim.snapshot().completion).toBeNull();
    expect(sim.snapshot().lastExitAttempt).toBeNull();
    sim.dispose();
  });
  it('clears completion on repeated authoring reload with a stable body count', () => {
    const { sim, physics } = make();
    for (let i = 0; i < 10; i++) {
      physics.setBodyVelocity(0, { x: 160, y: 0 });
      sim.step([]);
      expect(sim.snapshot().completion).not.toBeNull();
      sim.replaceLevel(level);
      expect(sim.snapshot().completion).toBeNull();
      expect(sim.snapshot().lastExitAttempt).toBeNull();
      expect(sim.stats().physics).toEqual({ bodies: 1, joints: 0, contacts: 0 });
    }
    sim.dispose();
  });
});
