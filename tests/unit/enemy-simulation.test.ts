import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import dropJson from '../../content/levels/lab-goon-drop.json';
import { parseRuntimeTuning, parseLevel } from '../../src/content';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { Simulation, hashSnapshot, type LevelDef, type PatrollerDef } from '../../src/sim';
const tuning = parseRuntimeTuning(runtimeJson).sim;
const goon: PatrollerDef = {
  id: 'goon',
  kind: 'patroller',
  position: { x: 0, y: 0 },
  size: { x: 2, y: 1 },
  stomp: { minDownSpeed: 2, reboundSpeed: 15, topInset: 0.15 },
};
const level: LevelDef = {
  id: 'test',
  name: 'test',
  spawn: { x: 0, y: -2 },
  bounds: { minX: -20, maxX: 20, minY: -20, maxY: 20 },
  killY: 20,
  solids: [],
  anchors: [],
  enemies: [goon],
};
function make(def = level, gravity = 0) {
  const physics = new KinematicPhysicsAdapter();
  const sim = new Simulation(
    { ...tuning, gravity, player: { ...tuning.player, maxFallSpeed: 200 } },
    physics,
    def,
  );
  return { sim, physics };
}
describe('patroller simulation', () => {
  it('immediately kills when an end-of-tick rope correction leaves actual overlap', () => {
    const physics = new KinematicPhysicsAdapter();
    const sim = new Simulation(
      {
        ...tuning,
        gravity: 0,
        physicsSubsteps: 1,
        player: { ...tuning.player, maxFallSpeed: 200 },
      },
      physics,
      {
        ...level,
        spawn: { x: 0.8, y: 0 },
        enemies: [{ ...goon, position: { x: 0.9, y: 1.1 }, size: { x: 1.2, y: 1 } }],
      },
    );
    physics.attachRope(0, { kind: 'static', point: { x: 0, y: 0 } }, 1);
    physics.setBodyVelocity(0, { x: 160, y: 160 });
    sim.step([]);
    expect(sim.snapshot().deaths).toBe(1);
    expect(sim.snapshot().lastDeath?.cause).toBe('enemy-contact');
    expect(sim.snapshot().player.position).toEqual({ x: 0.8, y: 0 });
    expect(sim.drainEvents().some((event) => event.type === 'stomp')).toBe(false);
    sim.dispose();
  });
  it('continues from the authored drop stomp to next anchor and releases with momentum', () => {
    const physics = new KinematicPhysicsAdapter();
    const sim = new Simulation(tuning, physics, parseLevel(dropJson));
    let stompTick = -1;
    let attached = false;
    let released = false;
    let minY = Infinity;
    for (let tick = 0; tick < 130; tick++) {
      const intents: import('../../src/core').Intent[] = [{ type: 'move', axis: 1 }];
      if (stompTick >= 0 && tick === stompTick + 18)
        intents.push({ type: 'ropeAim', target: { x: 11, y: 2 } }, { type: 'ropePress' });
      if (stompTick >= 0 && tick === stompTick + 28) intents.push({ type: 'ropeRelease' });
      sim.step(intents);
      for (const event of sim.drainEvents()) {
        if (event.type === 'death' && process.env.GOON_REPORT) console.log({ death: event });
        if (event.type === 'stomp') {
          stompTick = tick;
          if (process.env.GOON_REPORT) console.log({ stomp: event });
        }
        if (event.type === 'ropeAttach') attached = true;
        if (event.type === 'ropeRelease') {
          released = true;
          expect(Math.hypot(event.velocity.x, event.velocity.y)).toBeGreaterThan(1);
        }
      }
      if (stompTick >= 0) minY = Math.min(minY, sim.snapshot().player.position.y);
    }
    if (process.env.GOON_REPORT)
      console.log({ stompTick, minY, attached, released, deaths: sim.snapshot().deaths });
    expect(stompTick).toBeGreaterThan(0);
    expect(attached).toBe(true);
    expect(released).toBe(true);
    expect(sim.snapshot().deaths).toBe(0);
    sim.dispose();
  });
  it('does not sweep an empty precise path across a correction-only relocation', () => {
    const { sim, physics } = make({ ...level, spawn: { x: -2, y: 0 } });
    physics.step = () => {
      physics.setBodyPosition(0, { x: 2, y: 0 });
    };
    sim.step([]);
    expect(sim.snapshot().deaths).toBe(0);
    expect(sim.snapshot().enemies[0]?.alive).toBe(true);
    sim.dispose();
  });
  it('does not sweep an angled rope projection through an otherwise untouched enemy', () => {
    const physics = new KinematicPhysicsAdapter();
    const sim = new Simulation(
      {
        ...tuning,
        gravity: 0,
        physicsSubsteps: 1,
        player: { ...tuning.player, radius: 0.01, maxFallSpeed: 200 },
      },
      physics,
      {
        ...level,
        spawn: { x: 0.8, y: 0 },
        enemies: [
          {
            ...goon,
            position: { x: 0.88, y: 0.4 },
            size: { x: 0.02, y: 0.02 },
            stomp: { ...goon.stomp, topInset: 0.001 },
          },
        ],
      },
    );
    physics.attachRope(0, { kind: 'static', point: { x: 0, y: 0 } }, 1);
    physics.setBodyVelocity(0, { x: 160, y: 160 });
    sim.step([]);
    expect(physics.bodyMotion(0).some((segment) => segment.correction)).toBe(true);
    expect(sim.snapshot().deaths).toBe(0);
    expect(sim.snapshot().enemies[0]?.alive).toBe(true);
    sim.dispose();
  });
  it('detects a moving patrol approaching an otherwise stationary player', () => {
    const { sim } = make({
      ...level,
      spawn: { x: 0, y: 0 },
      enemies: [{ ...goon, position: { x: -3, y: 0 }, path: { to: { x: 3, y: 0 }, period: 1 } }],
    });
    for (let i = 0; i < 20 && sim.snapshot().deaths === 0; i++) sim.step([]);
    expect(sim.snapshot().lastDeath?.cause).toBe('enemy-contact');
    sim.dispose();
  });
  it.each([
    { height: -1, death: true },
    { height: 0.5, death: false },
  ])('orders stomp against lethal surface at y$height', ({ height, death }) => {
    const { sim, physics } = make({
      ...level,
      solids: [
        {
          id: 'hazard',
          kind: 'hazard',
          points: [
            { x: -5, y: height },
            { x: 5, y: height },
            { x: 5, y: height + 0.2 },
            { x: -5, y: height + 0.2 },
          ],
        },
      ],
    });
    physics.setBodyVelocity(0, { x: 0, y: 160 });
    sim.step([]);
    expect(sim.snapshot().deaths).toBe(death ? 1 : 0);
    expect(sim.snapshot().enemies[0]?.alive).toBe(death);
    if (death) expect(sim.snapshot().lastDeath?.cause).toBe('hazard');
    sim.dispose();
  });
  it('orders two enemies by impact time rather than authored array order', () => {
    const { sim, physics } = make({
      ...level,
      enemies: [
        { ...goon, id: 'later', position: { x: 0, y: 1 } },
        { ...goon, id: 'first' },
      ],
    });
    physics.setBodyVelocity(0, { x: 0, y: 160 });
    sim.step([]);
    expect(sim.snapshot().enemies.map((e) => e.alive)).toEqual([true, false]);
    expect(sim.drainEvents().find((e) => e.type === 'stomp')).toMatchObject({ enemy: 'first' });
    sim.dispose();
  });
  it('resolves high speed at top contact, preserves vx and applies rebound once', () => {
    const { sim, physics } = make();
    physics.setBodyVelocity(0, { x: 3, y: 160 });
    sim.step([]);
    expect(sim.snapshot().enemies[0]?.alive).toBe(false);
    expect(sim.snapshot().player.position.y).toBeCloseTo(-0.85, 12);
    expect(sim.snapshot().player.velocity).toEqual({ x: 3, y: -15 });
    expect(sim.drainEvents().filter((e) => e.type === 'stomp')).toHaveLength(1);
    sim.step([]);
    expect(sim.drainEvents().filter((e) => e.type === 'stomp')).toHaveLength(0);
    sim.dispose();
  });
  it('unsafe side contact immediately resets with enemy identity and restores patrol', () => {
    const { sim, physics } = make({ ...level, spawn: { x: -2, y: 0 } });
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    const s = sim.snapshot();
    expect(s.deaths).toBe(1);
    expect(s.lastDeath).toMatchObject({ cause: 'enemy-contact', enemy: 'goon', solid: null });
    expect(s.player.position).toEqual({ x: -2, y: 0 });
    expect(s.enemies[0]?.alive).toBe(true);
    expect(sim.drainEvents().map((e) => e.type)).toEqual(['death', 'lifeEnd', 'reset']);
    sim.dispose();
  });
  it('does not use a later floor impulse to turn side/corner arrival into a stomp', () => {
    const { sim, physics } = make({
      ...level,
      spawn: { x: 1.2, y: -1 },
      solids: [
        {
          id: 'floor',
          kind: 'solid',
          points: [
            { x: -5, y: 1 },
            { x: 5, y: 1 },
            { x: 5, y: 2 },
            { x: -5, y: 2 },
          ],
        },
      ],
    });
    physics.setBodyVelocity(0, { x: 0, y: 160 });
    sim.step([]);
    expect(sim.snapshot().lastDeath?.cause).toBe('enemy-contact');
    expect(sim.drainEvents().some((e) => e.type === 'stomp')).toBe(false);
    sim.dispose();
  });
  it('keeps rope ownership and length through the rebound', () => {
    const { sim, physics } = make({
      ...level,
      anchors: [{ id: 'a', position: { x: 0, y: 5 }, radius: 0.4 }],
    });
    physics.setBodyVelocity(0, { x: 3, y: 160 });
    sim.step([{ type: 'ropeAim', target: { x: 0, y: 5 } }, { type: 'ropePress' }]);
    expect(sim.snapshot().enemies[0]?.alive).toBe(false);
    expect(sim.snapshot().rope?.length).toBeCloseTo(7, 12);
    expect(sim.snapshot().player.velocity).toEqual({ x: 3, y: -15 });
    expect(sim.stats().physics.joints).toBe(1);
    sim.dispose();
  });
  it('never contacts an enemy on a discarded provisional rope overshoot', () => {
    const { sim, physics } = make({
      ...level,
      spawn: { x: 0.8, y: 0 },
      enemies: [{ ...goon, position: { x: 2, y: 0 }, size: { x: 0.3, y: 1 } }],
    });
    physics.attachRope(0, { kind: 'static', point: { x: 0, y: 0 } }, 1);
    physics.setBodyVelocity(0, { x: 160, y: 0 });
    sim.step([]);
    expect(sim.snapshot().deaths).toBe(0);
    expect(sim.snapshot().enemies[0]?.alive).toBe(true);
    sim.dispose();
  });
  it('restores defeated enemies on reset and repeated reload without new bodies', () => {
    const { sim, physics } = make();
    for (let i = 0; i < 10; i++) {
      physics.setBodyVelocity(0, { x: 0, y: 160 });
      sim.step([]);
      expect(sim.snapshot().enemies[0]?.alive).toBe(false);
      sim.reset();
      expect(sim.snapshot().enemies[0]?.alive).toBe(true);
      sim.replaceLevel(level);
      expect(sim.stats().physics.bodies).toBe(1);
      expect(sim.stats().entities).toBe(2);
    }
    sim.dispose();
  });
  it.each([12.5, 15, 18])('measures usable continuation height at rebound %s', (reboundSpeed) => {
    const def = { ...level, enemies: [{ ...goon, stomp: { ...goon.stomp, reboundSpeed } }] };
    const { sim, physics } = make(def, 30);
    physics.setBodyVelocity(0, { x: 0, y: 160 });
    sim.step([]);
    const contact = sim.snapshot().player.position.y;
    let minY = contact;
    let apexTick = 0;
    for (let i = 0; i < 80; i++) {
      sim.step([]);
      const s = sim.snapshot();
      if (s.player.position.y < minY) {
        minY = s.player.position.y;
        apexTick = s.tick;
      }
      if (s.player.velocity.y >= 0) break;
    }
    const height = contact - minY;
    expect(height).toBeGreaterThan((reboundSpeed * reboundSpeed) / 60 - 0.1);
    expect(height).toBeLessThanOrEqual((reboundSpeed * reboundSpeed) / 60);
    if (process.env.GOON_REPORT) console.log({ reboundSpeed, height, apexTick });
    sim.dispose();
  });
  it('repeats deterministic enemy state hashes from identical inputs', () => {
    const run = () => {
      const { sim, physics } = make({
        ...level,
        enemies: [{ ...goon, path: { to: { x: 2, y: 0 }, period: 3 } }],
      });
      physics.setBodyVelocity(0, { x: 0, y: 160 });
      const hashes = [];
      for (let i = 0; i < 40; i++) {
        sim.step([]);
        hashes.push(hashSnapshot(sim.snapshot()));
      }
      sim.dispose();
      return hashes;
    };
    expect(run()).toEqual(run());
  });
});
