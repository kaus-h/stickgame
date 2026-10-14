import { describe, expect, it } from 'vitest';
import levelJson from '../../content/levels/lab-impact.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseLevel } from '../../src/content';
import { SIM_DT, vec2, type Intent } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import {
  anchorPathState,
  hashSnapshot,
  Simulation,
  type LevelDef,
  type SimEvent,
  type TargetDef,
} from '../../src/sim';
import { impactApproachAllowed, impactContact } from '../../src/sim/impactTargets';
import { PlanSource, parseRuntimeTuning, World, type PlanStep } from '../../src/tools/route-solver';

const tuning = parseRuntimeTuning(runtimeJson);
const lab = parseLevel(levelJson);
const SWING: PlanStep[] = [
  { t: 0, action: 'move', axis: 1 },
  { t: 5, action: 'jump', hold: 20 },
  { t: 15, action: 'rope', anchor: 0, offset: 0, release: null },
];

function runLab(steps: PlanStep[], ticks = 120, level = lab) {
  const world = World.create(level, tuning);
  const source = new PlanSource(steps, level);
  const events: SimEvent[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < ticks; i++) {
    events.push(...world.step(source));
    hashes.push(hashSnapshot(world.sim.snapshot()));
    if (events.some((event) => event.type === 'targetHit' || event.type === 'targetBlocked')) break;
  }
  return { world, events, hashes };
}

const target: TargetDef = { id: 'target', position: vec2(0, 0), radius: 0.6, hp: 1 };
const isolated: LevelDef = {
  id: 'impact-test',
  name: 'Impact test',
  spawn: vec2(-2, 0),
  bounds: { minX: -30, minY: -30, maxX: 30, maxY: 30 },
  killY: 30,
  solids: [],
  anchors: [],
  targets: [target],
};

/** Real fixed-step adapter, with gravity disabled to isolate exact contact normal responses. */
function make(level: LevelDef = isolated, restitution = 0.5) {
  const physics = new KinematicPhysicsAdapter();
  const sim = new Simulation(
    { ...tuning.sim, gravity: 0, combat: { minImpactSpeed: 9, restitution } },
    physics,
    level,
  );
  return { physics, sim };
}

function strike(
  setup: ReturnType<typeof make>,
  x = 0,
  speed = 12,
  tangentialSpeed = 0,
  intents: readonly Intent[] = [],
) {
  setup.physics.teleportBody(0, vec2(x - 1, -tangentialSpeed * SIM_DT));
  setup.physics.setBodyVelocity(0, vec2(speed, tangentialSpeed));
  setup.sim.step(intents);
  return setup.sim.drainEvents();
}

const requireTargets = (level: LevelDef) => {
  if (!level.targets) throw new Error('fixture requires impact targets');
  return level.targets;
};

describe('momentum-impact hand plans (GMR-119)', () => {
  it('a fast tethered swing breaks the lab target and keeps the rope attached', () => {
    const { world, events } = runLab(SWING);
    const hit = events.find((event) => event.type === 'targetHit');
    expect(hit).toMatchObject({ id: 'impact', tick: 51, hpLeft: 0 });
    expect(hit?.type === 'targetHit' ? hit.speed : 0).toBeGreaterThan(12);
    expect(events.filter((event) => event.type === 'targetBroken')).toEqual([
      { type: 'targetBroken', tick: 51, id: 'impact' },
    ]);
    expect(events.some((event) => event.type === 'ropeAttach')).toBe(true);
    expect(events.some((event) => event.type === 'ropeRelease' || event.type === 'death')).toBe(
      false,
    );
    expect(world.sim.snapshot().rope?.anchor).toBe(0);
    expect(world.sim.snapshot().targets[0]?.hp).toBe(0);
    world.sim.dispose();
  });

  it('the flat run-up is blocked below the threshold without damage', () => {
    const { world, events } = runLab([{ t: 0, action: 'move', axis: 1 }]);
    const blocked = events.find((event) => event.type === 'targetBlocked');
    expect(blocked).toMatchObject({ id: 'impact' });
    expect(blocked?.type === 'targetBlocked' ? blocked.speed : Infinity).toBeLessThan(9);
    expect(
      events.some((event) => event.type === 'targetHit' || event.type === 'targetBroken'),
    ).toBe(false);
    expect(world.sim.snapshot().targets[0]?.hp).toBe(1);
    expect(world.sim.snapshot().player.velocity.x).toBeLessThan(0);
    world.sim.dispose();
  });

  it('a slow analog walk-in is blocked without damage', () => {
    const world = World.create(lab, tuning);
    let blocked: SimEvent | undefined;
    for (let tick = 0; tick < 300 && !blocked; tick++) {
      blocked = world
        .step({ intents: (t) => (t === 0 ? [{ type: 'move', axis: 0.25 }] : []) })
        .find((event) => event.type === 'targetBlocked');
    }
    expect(blocked).toMatchObject({ id: 'impact' });
    expect(blocked?.type === 'targetBlocked' ? blocked.speed : Infinity).toBeLessThan(2);
    expect(world.sim.snapshot().targets[0]?.hp).toBe(1);
    world.sim.dispose();
  });

  it('an incompatible approach cone blocks the same fast swing', () => {
    const level = {
      ...lab,
      targets: requireTargets(lab).map((def) => ({ ...def, approach: { min: 150, max: 210 } })),
    };
    const { world, events } = runLab(SWING, 120, level);
    const blocked = events.find((event) => event.type === 'targetBlocked');
    expect(blocked?.type === 'targetBlocked' ? blocked.speed : 0).toBeGreaterThan(12);
    expect(world.sim.snapshot().targets[0]?.hp).toBe(1);
    expect(world.sim.snapshot().rope).not.toBeNull();
    world.sim.dispose();
  });

  it('replaying the hand plan produces identical events and hashes each tick', () => {
    const a = runLab(SWING);
    const b = runLab(SWING);
    expect(a.events).toEqual(b.events);
    expect(a.hashes).toEqual(b.hashes);
    a.world.sim.dispose();
    b.world.sim.dispose();
  });

  it('a fork advances target state without changing its source world', () => {
    const world = World.create(lab, tuning);
    const source = new PlanSource(SWING, lab);
    while (world.tick < 50) world.step(source);
    const fork = world.fork();
    fork.step(source);
    expect(fork.sim.snapshot().targets[0]?.hp).toBe(0);
    expect(world.sim.snapshot().targets[0]?.hp).toBe(1);
    world.step(source);
    expect(hashSnapshot(world.sim.snapshot())).toBe(hashSnapshot(fork.sim.snapshot()));
    world.sim.dispose();
    fork.sim.dispose();
  });
});

describe('impact target contact rules', () => {
  it.each([0, 0.25, 0.5, 1])(
    'reflects normal speed by restitution %s and preserves tangential speed',
    (restitution) => {
      const setup = make(isolated, restitution);
      expect(strike(setup, 0, 12, 4)).toContainEqual({
        type: 'targetHit',
        tick: 1,
        id: 'target',
        speed: 12,
        hpLeft: 0,
      });
      expect(setup.sim.snapshot().player.velocity.x).toBeCloseTo(-12 * restitution, 10);
      expect(setup.sim.snapshot().player.velocity.y).toBeCloseTo(4, 10);
      setup.sim.dispose();
    },
  );

  it('accepts the exact closing-speed threshold and records the last impact', () => {
    const setup = make();
    expect(strike(setup, 0, 9)).toContainEqual({
      type: 'targetHit',
      tick: 1,
      id: 'target',
      speed: 9,
      hpLeft: 0,
    });
    expect(setup.sim.snapshot().targets[0]).toMatchObject({
      hp: 0,
      minSpeed: 9,
      lastImpactSpeed: 9,
    });
    setup.sim.dispose();
  });

  it('uses closing speed rather than the magnitude of a glancing arrival', () => {
    const setup = make();
    setup.physics.teleportBody(0, vec2(-0.99, -20 * SIM_DT));
    setup.physics.setBodyVelocity(0, vec2(3, 20));
    setup.sim.step([]);
    const blocked = setup.sim.drainEvents().find((event) => event.type === 'targetBlocked');
    expect(blocked).toMatchObject({ id: 'target', tick: 1 });
    expect(blocked?.type === 'targetBlocked' ? blocked.speed : Infinity).toBeCloseTo(3, 10);
    expect(setup.sim.snapshot().targets[0]?.hp).toBe(1);
    expect(setup.sim.snapshot().player.velocity.x).toBeCloseTo(-1.5, 10);
    expect(setup.sim.snapshot().player.velocity.y).toBeCloseTo(20, 10);
    setup.sim.dispose();
  });

  it('does not reverse an already outgoing overlapped contact', () => {
    const setup = make();
    setup.physics.teleportBody(0, vec2(-0.5, 0));
    setup.physics.setBodyVelocity(0, vec2(-3, 0));
    setup.sim.step([]);
    expect(setup.sim.drainEvents()).toContainEqual({
      type: 'targetBlocked',
      tick: 1,
      id: 'target',
      speed: -3,
    });
    expect(setup.sim.snapshot().player.velocity.x).toBe(-3);
    setup.sim.dispose();
  });

  it('a per-target speed override takes precedence over runtime tuning', () => {
    const setup = make({ ...isolated, targets: [{ ...target, minSpeed: 13 }] });
    expect(strike(setup)).toContainEqual({
      type: 'targetBlocked',
      tick: 1,
      id: 'target',
      speed: 12,
    });
    expect(setup.sim.snapshot().targets[0]).toMatchObject({ hp: 1, minSpeed: 13 });
    setup.sim.dispose();
  });

  it('takes one hp per arrival and broken targets stop colliding', () => {
    const setup = make({ ...isolated, targets: [{ ...target, hp: 2 }] });
    const first = strike(setup);
    expect(first).toContainEqual({
      type: 'targetHit',
      tick: 1,
      id: 'target',
      speed: 12,
      hpLeft: 1,
    });
    expect(first.some((event) => event.type === 'targetBroken')).toBe(false);
    setup.sim.step([]);
    expect(setup.sim.drainEvents().some((event) => event.type === 'targetHit')).toBe(false);
    const second = strike(setup);
    expect(second.filter((event) => event.type.startsWith('target'))).toEqual([
      { type: 'targetHit', tick: 3, id: 'target', speed: 12, hpLeft: 0 },
      { type: 'targetBroken', tick: 3, id: 'target' },
    ]);
    expect(strike(setup).some((event) => event.type.startsWith('target'))).toBe(false);
    expect(setup.sim.snapshot().player.velocity.x).toBe(12);
    setup.sim.dispose();
  });

  it('a rope press aimed at an impact target never selects it', () => {
    const setup = make();
    setup.sim.step([{ type: 'ropeAim', target: vec2(0, 0) }, { type: 'ropePress' }]);
    expect(setup.sim.snapshot().rope).toBeNull();
    expect(setup.sim.drainEvents().some((event) => event.type === 'ropeAttach')).toBe(false);
    setup.sim.dispose();
  });

  it('a restart restores hp for broken and damaged targets', () => {
    const setup = make({
      ...isolated,
      targets: [target, { ...target, id: 'armored', position: vec2(3, 0), hp: 2 }],
    });
    strike(setup);
    strike(setup, 3);
    expect(setup.sim.snapshot().targets.map((state) => state.hp)).toEqual([0, 1]);
    setup.sim.step([{ type: 'restart' }]);
    expect(setup.sim.snapshot().targets.map((state) => state.hp)).toEqual([1, 2]);
    expect(setup.sim.snapshot().targets.map((state) => state.lastImpactSpeed)).toEqual([
      null,
      null,
    ]);
    setup.sim.dispose();
  });

  it('checkpoint respawn keeps broken targets and heals unbroken targets', () => {
    const setup = make({
      ...isolated,
      checkpoints: [{ id: 'start', position: isolated.spawn }],
      targets: [target, { ...target, id: 'armored', position: vec2(3, 0), hp: 2 }],
    });
    setup.sim.step([]);
    expect(setup.sim.snapshot().checkpoint).toBe(0);
    strike(setup);
    strike(setup, 3);
    setup.sim.step([{ type: 'respawn' }]);
    expect(setup.sim.snapshot().targets.map((state) => state.hp)).toEqual([0, 2]);
    expect(setup.sim.snapshot().targets.map((state) => state.lastImpactSpeed)).toEqual([
      null,
      null,
    ]);
    expect(setup.sim.snapshot().player.position).toEqual(isolated.spawn);
    expect(strike(setup).some((event) => event.type.startsWith('target'))).toBe(false);
    setup.sim.dispose();
  });

  it('an immediate death respawn at a checkpoint also preserves broken targets', () => {
    const setup = make({
      ...isolated,
      checkpoints: [{ id: 'start', position: isolated.spawn }],
      targets: [target, { ...target, id: 'armored', position: vec2(3, 0), hp: 2 }],
    });
    setup.sim.step([]);
    strike(setup);
    strike(setup, 3);
    setup.physics.teleportBody(0, vec2(3, 31));
    setup.sim.step([]);
    expect(setup.sim.snapshot().deaths).toBe(1);
    expect(setup.sim.snapshot().targets.map((state) => state.hp)).toEqual([0, 2]);
    expect(setup.sim.snapshot().player.position).toEqual(isolated.spawn);
    expect(setup.sim.drainEvents()).toContainEqual({
      type: 'respawn',
      tick: 4,
      checkpoint: 0,
      voluntary: false,
    });
    setup.sim.dispose();
  });

  it('moving targets use the anchor path on the fixed attempt clock', () => {
    const moving = { ...target, position: vec2(5, 0), path: { to: vec2(7, 0), period: 4 } };
    const setup = make({ ...isolated, targets: [moving] });
    for (let tick = 1; tick <= 60; tick++) {
      setup.sim.step([]);
      expect(setup.sim.snapshot().targets[0]?.position).toEqual(
        anchorPathState(moving, tick * SIM_DT).position,
      );
    }
    setup.sim.dispose();
  });

  it('hashes hp including beyond 32 bits, position, radius, threshold, and last impact speed', () => {
    const setup = make();
    const snapshot = setup.sim.snapshot();
    const original = hashSnapshot(snapshot);
    for (const changed of [
      { hp: 0 },
      { hp: 1 + 2 ** 32 },
      { position: vec2(0.1, 0) },
      { radius: 0.7 },
      { minSpeed: 10 },
      { lastImpactSpeed: 4 },
    ]) {
      expect(
        hashSnapshot({
          ...snapshot,
          targets: snapshot.targets.map((state) => ({ ...state, ...changed })),
        }),
      ).not.toBe(original);
    }
    setup.sim.dispose();
  });
});

describe('impact geometry', () => {
  it.each([
    [vec2(1, 0), { min: -30, max: 30 }, true],
    [vec2(0, 1), { min: -30, max: 30 }, false],
    [vec2(1, 0), { min: 330, max: 30 }, true],
    [vec2(0, -1), { min: 260, max: 280 }, true],
    [vec2(-1, 0), { min: 45, max: 315 }, true],
    [vec2(1, 0), { min: 45, max: 315 }, false],
    [vec2(0, 1), { min: 90, max: 90 }, true],
    [vec2(1, 0), { min: 90, max: 90 }, false],
    [vec2(-1, 0), { min: 0, max: 360 }, true],
    [vec2(0, 0), { min: 0, max: 90 }, false],
  ] as const)('checks velocity %j against angle window %j', (velocity, window, allowed) => {
    expect(impactApproachAllowed(velocity, window)).toBe(allowed);
  });

  it('includes angle-window edges and permits every angle when absent', () => {
    expect(impactApproachAllowed(vec2(1, 1), { min: -45, max: 45 })).toBe(true);
    expect(impactApproachAllowed(vec2(1, -1), { min: -45, max: 45 })).toBe(true);
    expect(impactApproachAllowed(vec2(-1, 0))).toBe(true);
  });

  it('handles coincident centers deterministically without NaN', () => {
    const state = { ...target, minSpeed: 9, lastImpactSpeed: null };
    expect(impactContact(vec2(0, 0), vec2(0, 12), 0.35, state)).toEqual({
      normal: vec2(0, 1),
      speed: 12,
      separation: 0.95,
    });
    expect(impactContact(vec2(0, 0), vec2(0, 0), 0.35, state)).toEqual({
      normal: vec2(1, 0),
      speed: 0,
      separation: 0.95,
    });
    expect(impactContact(vec2(2, 0), vec2(12, 0), 0.35, state)).toBeNull();
  });
});
