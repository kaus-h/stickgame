import { describe, expect, it } from 'vitest';
import { vec2, type Intent } from '../core';
import { KinematicPhysicsAdapter } from '../physics/backends/kinematic/KinematicPhysicsAdapter';
import type { LevelDef } from './level';
import { Simulation } from './Simulation';
import type { SimTuning } from './tuning';

const tuning: SimTuning = {
  gravity: 30,
  physicsSubsteps: 4,
  player: {
    radius: 0.35,
    runSpeed: 7.5,
    groundAccel: 80,
    groundDecel: 100,
    airAccel: 40,
    airMaxSpeed: 7.5,
    jumpSpeed: 12.5,
    jumpCut: 0.45,
    fallGravityScale: 1.6,
    maxFallSpeed: 26,
    coyoteTicks: 6,
    jumpBufferTicks: 7,
  },
  rope: { minLength: 0.8, maxLength: 11, selectRadius: 1.1, steerAccel: 6 },
};

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

/** A flat floor at y = 8 from x 0..20, a 4 m gap, then floor again; lethal strip at y = 11. */
const level: LevelDef = {
  id: 'test',
  name: 'test',
  spawn: vec2(2, 7.6),
  bounds: { minX: 0, minY: -10, maxX: 40, maxY: 12 },
  killY: 13,
  solids: [
    box('floor-a', 0, 8, 20, 2),
    box('floor-b', 24, 8, 16, 2),
    box('lava', 0, 11, 40, 1, 'hazard'),
  ],
  anchors: [],
};

function run(sim: Simulation, ticks: number, intents: (tick: number) => Intent[] = () => []): void {
  for (let i = 0; i < ticks; i++) sim.step(intents(sim.snapshot().tick));
}

const make = (l: LevelDef = level) => new Simulation(tuning, new KinematicPhysicsAdapter(), l);

describe('player controller', () => {
  it('settles on the floor and is grounded', () => {
    const sim = make();
    run(sim, 30);
    const s = sim.snapshot();
    expect(s.player.mode).toBe('grounded');
    expect(s.player.position.y).toBeCloseTo(8 - 0.35, 2);
  });

  it('reaches run speed within a fraction of a second and stops crisply', () => {
    const sim = make();
    run(sim, 20);
    sim.step([{ type: 'move', axis: 1 }]);
    run(sim, 8);
    expect(sim.snapshot().player.velocity.x).toBeCloseTo(7.5, 6);
    sim.step([{ type: 'move', axis: 0 }]);
    run(sim, 5);
    expect(sim.snapshot().player.velocity.x).toBe(0);
  });

  it('a full jump rises about 2.6 m; a tapped jump far less', () => {
    const apex = (release: number | null): number => {
      const sim = make();
      run(sim, 20);
      const start = sim.snapshot().player.position.y;
      let min = start;
      for (let t = 0; t < 90; t++) {
        const intents: Intent[] =
          t === 0 ? [{ type: 'jumpPress' }] : t === release ? [{ type: 'jumpRelease' }] : [];
        sim.step(intents);
        min = Math.min(min, sim.snapshot().player.position.y);
      }
      return start - min;
    };
    const full = apex(null);
    const tap = apex(3);
    expect(full).toBeGreaterThan(2.4);
    expect(full).toBeLessThan(2.8);
    expect(tap).toBeLessThan(full * 0.5);
  });

  it('allows a jump shortly after running off a ledge (coyote time) but not later', () => {
    const jumpsAfterLedge = (delay: number): boolean => {
      const sim = make();
      run(sim, 20);
      sim.step([{ type: 'move', axis: 1 }]);
      let leftGround = -1;
      for (let t = 0; t < 200 && leftGround < 0; t++) {
        sim.step([]);
        if (sim.snapshot().player.mode === 'air') leftGround = t;
      }
      run(sim, delay);
      sim.step([{ type: 'jumpPress' }]);
      return sim.snapshot().player.velocity.y < -5;
    };
    expect(jumpsAfterLedge(3)).toBe(true);
    expect(jumpsAfterLedge(12)).toBe(false);
  });

  it('remembers a jump pressed just before landing (buffer)', () => {
    const sim = make();
    run(sim, 20);
    sim.step([{ type: 'jumpPress' }, { type: 'jumpRelease' }]);
    let landedTick = -1;
    let pressed = false;
    for (let t = 0; t < 120; t++) {
      const s = sim.snapshot();
      const nearFloor = s.player.velocity.y > 0 && s.player.position.y > 7.2;
      sim.step(!pressed && nearFloor ? [{ type: 'jumpPress' }] : []);
      if (!pressed && nearFloor) pressed = true;
      if (pressed && sim.snapshot().player.velocity.y < -5) {
        landedTick = t;
        break;
      }
    }
    expect(landedTick).toBeGreaterThan(0);
  });

  it('keeps fast horizontal momentum in the air when holding the same direction', () => {
    const sim = make();
    run(sim, 20);
    sim.step([{ type: 'jumpPress' }]);
    run(sim, 2);
    // Simulate a fast swing release: the controller must not brake it to airMaxSpeed.
    const physicsSpeed = 14;
    (sim as unknown as { physics: KinematicPhysicsAdapter }).physics.setBodyVelocity(
      0,
      vec2(physicsSpeed, -2),
    );
    sim.step([{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().player.velocity.x).toBeCloseTo(physicsSpeed, 6);
  });

  it('dies instantly in the lethal floor and respawns the same tick', () => {
    const sim = make();
    sim.step([{ type: 'move', axis: 1 }]);
    run(sim, 240);
    const events = sim.drainEvents();
    const death = events.find((e) => e.type === 'death') as
      { cause: string; tick: number } | undefined;
    expect(death).toBeDefined();
    expect(death?.cause).toBe('hazard');
    expect(sim.snapshot().deaths).toBeGreaterThan(0);
    const reset = events.find((e) => e.type === 'reset');
    expect(reset?.tick).toBe(death?.tick);
  });

  it('dies when falling out of bounds', () => {
    const open: LevelDef = { ...level, solids: [box('floor-a', 0, 8, 5, 2)] };
    const sim = make(open);
    sim.step([{ type: 'move', axis: 1 }]);
    run(sim, 300);
    const death = sim.drainEvents().find((e) => e.type === 'death') as
      { cause: string } | undefined;
    expect(death?.cause).toBe('out-of-bounds');
  });

  it('is deterministic for the same intents', () => {
    const script = (t: number): Intent[] =>
      t === 10
        ? [{ type: 'move', axis: 1 }]
        : t === 40
          ? [{ type: 'jumpPress' }]
          : t === 52
            ? [{ type: 'jumpRelease' }]
            : [];
    const a = make();
    const b = make();
    run(a, 400, script);
    run(b, 400, script);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe('rope targeting in the simulation', () => {
  const withAnchors: LevelDef = {
    ...level,
    solids: [...level.solids, box('wall', 6, 2, 0.5, 6)],
    anchors: [
      { id: 'near', position: vec2(4, 3), radius: 0.4 },
      { id: 'behind-wall', position: vec2(9, 3), radius: 0.4 },
      { id: 'moving', position: vec2(1, 2), radius: 0.4, path: { to: vec2(3, 2), period: 2 } },
    ],
  };

  it('has no target until there is an aim point', () => {
    const sim = make(withAnchors);
    run(sim, 10);
    expect(sim.snapshot().target).toBeNull();
  });

  it('resolves anchor, impact point, distance and validity every tick', () => {
    const sim = make(withAnchors);
    run(sim, 10);
    sim.step([{ type: 'ropeAim', target: vec2(4.1, 3.2) }]);
    const s = sim.snapshot();
    expect(s.target).toMatchObject({ valid: true, anchor: 0, impact: vec2(4.1, 3.2) });
    const d = Math.hypot(4.1 - s.player.position.x, 3.2 - s.player.position.y);
    expect(s.target?.distance).toBeCloseTo(d, 12);
  });

  it('reports a blocked shot through level geometry and a background miss', () => {
    const sim = make(withAnchors);
    run(sim, 10);
    sim.step([{ type: 'ropeAim', target: vec2(9, 3) }]);
    expect(sim.snapshot().target).toMatchObject({ valid: false, reason: 'blocked', anchor: 1 });
    sim.step([{ type: 'ropeAim', target: vec2(15, -6) }]);
    expect(sim.snapshot().target).toMatchObject({ valid: false, reason: 'no-anchor' });
  });

  it('tracks a moving anchor with a fixed aim point', () => {
    const sim = make(withAnchors);
    sim.step([{ type: 'ropeAim', target: vec2(1, 2) }]);
    const first = sim.snapshot().target;
    run(sim, 59); // half a period: the anchor is now at (3, 2), out of the selection region
    const later = sim.snapshot().target;
    expect(first).toMatchObject({ anchor: 2 });
    expect(later?.anchor).not.toBe(2);
  });
});
