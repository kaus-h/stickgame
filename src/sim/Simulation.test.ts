import { describe, expect, it } from 'vitest';
import { vec2, type Intent } from '../core';
import { KinematicPhysicsAdapter } from '../physics/backends/kinematic/KinematicPhysicsAdapter';
import type { LevelDef } from './level';
import type { SimEvent } from './Simulation';
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
  rope: {
    minLength: 0.8,
    maxLength: 11,
    selectRadius: 1.1,
    steerAccel: 6,
    steerEnergyHeight: 0.6,
    catchRetention: 1,
  },
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

  it('reports the real impact speed on landing', () => {
    const sim = make({ ...level, spawn: vec2(2, 2) });
    let land: { speed: number } | undefined;
    for (let i = 0; i < 120 && !land; i++) {
      sim.step([]);
      land = sim.drainEvents().find((e) => e.type === 'land');
    }
    // Dropped ~5.6 m: well above 10 m/s at impact.
    expect(land?.speed).toBeGreaterThan(10);
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

describe('tether', () => {
  /** A short start ledge, an anchor out over a deep pit, lava far below. */
  const pit: LevelDef = {
    ...level,
    spawn: vec2(1, 7.6),
    killY: 40,
    solids: [box('ledge', 0, 8, 4, 2), box('lava', -10, 30, 60, 1, 'hazard')],
    anchors: [{ id: 'hook', position: vec2(9, 2), radius: 0.4 }],
  };
  const hook = vec2(9, 2);
  const aimAndRun = (t: number): Intent[] =>
    t === 0
      ? [
          { type: 'ropeAim', target: hook },
          { type: 'move', axis: 1 },
        ]
      : [];

  function attachAt(tick: number): Simulation {
    const sim = make(pit);
    run(sim, tick, aimAndRun);
    sim.step([{ type: 'ropePress' }]);
    return sim;
  }

  /** Step until the rope locks (the player leaves the ground). */
  function untilLocked(sim: Simulation, intents: (t: number) => Intent[] = () => []): void {
    for (let i = 0; i < 300 && sim.snapshot().rope?.locked !== true; i++) {
      sim.step(intents(sim.snapshot().tick));
    }
    expect(sim.snapshot().rope?.locked).toBe(true);
  }

  it('an airborne connection locks the length to the impact distance on the press tick', () => {
    const sim = make(pit);
    run(sim, 20, aimAndRun);
    sim.step([{ type: 'jumpPress' }]);
    run(sim, 8);
    const before = sim.snapshot().player.position;
    expect(sim.snapshot().player.mode).toBe('air');
    sim.step([{ type: 'ropePress' }]);
    const events = sim.drainEvents();
    const expected = Math.hypot(hook.x - before.x, hook.y - before.y);
    expect(events.find((e) => e.type === 'ropeAttach')).toMatchObject({ anchor: 0 });
    const lock = events.find((e) => e.type === 'ropeLock') as { length: number } | undefined;
    expect(lock?.length).toBeCloseTo(expected, 12);
    expect(sim.snapshot().rope).toMatchObject({ locked: true });
    expect(sim.snapshot().rope?.length).toBeCloseTo(expected, 12);
  });

  it('a grounded connection pays out while running and locks at take-off', () => {
    const sim = make(pit);
    run(sim, 5, aimAndRun);
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope?.locked).toBe(false);
    const atAttach = sim.snapshot().rope?.length ?? 0;
    run(sim, 10);
    // Still on the ledge, closer to the anchor: the rope follows the distance, nothing locks.
    const paying = sim.snapshot();
    expect(paying.rope?.locked).toBe(false);
    expect(paying.rope?.length).toBeLessThan(atAttach);
    sim.drainEvents();
    untilLocked(sim);
    const s = sim.snapshot();
    const lock = sim.drainEvents().find((e) => e.type === 'ropeLock') as
      { length: number } | undefined;
    const d = Math.hypot(s.player.position.x - hook.x, s.player.position.y - hook.y);
    expect(lock?.length).toBeCloseTo(d, 9);
    expect(s.rope?.length).toBe(lock?.length);
  });

  it('run momentum carries into the swing at the taut catch', () => {
    /** Highest point (smallest y) reached after the rope catches. */
    const swingPeak = (catchRetention: number): number => {
      const t = { ...tuning, rope: { ...tuning.rope, catchRetention } };
      const sim = new Simulation(t, new KinematicPhysicsAdapter(), pit);
      run(sim, 5, aimAndRun);
      sim.step([{ type: 'ropePress' }]);
      run(sim, 15);
      sim.step([{ type: 'jumpPress' }]);
      let caught = false;
      let peak = Infinity;
      for (let i = 0; i < 150; i++) {
        sim.step([]);
        const s = sim.snapshot();
        caught ||= s.rope?.taut === true;
        if (caught) peak = Math.min(peak, s.player.position.y);
      }
      return peak;
    };
    // Full retention swings the player metres higher than an inelastic catch.
    expect(swingPeak(1)).toBeLessThan(swingPeak(0) - 3);
  });

  it('a locked rope stays locked through a landing (no re-measuring the shot)', () => {
    const low: LevelDef = {
      ...pit,
      anchors: [...pit.anchors, { id: 'low', position: vec2(2.5, 6.4), radius: 0.4 }],
    };
    const sim = make(low);
    run(sim, 30);
    sim.step([{ type: 'ropeAim', target: vec2(2.5, 6.4) }, { type: 'jumpPress' }]);
    for (let i = 0; i < 60 && sim.snapshot().player.velocity.y < 0; i++) sim.step([]);
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope).toMatchObject({ anchor: 1, locked: true });
    const first = sim.snapshot().rope?.length;
    for (let i = 0; i < 120 && sim.snapshot().player.mode !== 'grounded'; i++) sim.step([]);
    expect(sim.snapshot().player.mode).toBe('grounded');
    expect(sim.snapshot().rope).toMatchObject({ locked: true, length: first });
    run(sim, 3, () => [{ type: 'move', axis: -1 }]);
    sim.step([{ type: 'jumpPress' }]);
    run(sim, 10);
    expect(sim.snapshot().rope).toMatchObject({ locked: true, length: first });
    expect(sim.drainEvents().filter((e) => e.type === 'ropeLock')).toHaveLength(1);
  });

  it('taking off closer than minLength keeps paying out and locks at the measured distance', () => {
    const near: LevelDef = {
      ...pit,
      anchors: [{ id: 'near', position: vec2(2.6, 6.6), radius: 0.4 }],
    };
    const sim = make(near);
    run(sim, 5);
    sim.step([
      { type: 'ropeAim', target: vec2(2.6, 6.6) },
      { type: 'move', axis: 1 },
    ]);
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope?.locked).toBe(false);
    // Run right under the anchor (inside minLength) and jump there.
    for (let i = 0; i < 40 && sim.snapshot().player.position.x < 2.4; i++) sim.step([]);
    sim.drainEvents();
    let lock: { length: number } | undefined;
    let at = vec2(0, 0);
    for (let i = 0; i < 60 && !lock; i++) {
      sim.step(i === 0 ? [{ type: 'jumpPress' }] : []);
      lock = sim.drainEvents().find((e) => e.type === 'ropeLock');
      at = sim.snapshot().player.position;
    }
    expect(lock?.length).toBeGreaterThanOrEqual(tuning.rope.minLength);
    const p = sim.snapshot().rope?.point ?? vec2(0, 0);
    expect(lock?.length).toBeCloseTo(Math.hypot(at.x - p.x, at.y - p.y), 9);
  });

  it('air control still works while a locked rope is slack', () => {
    const sim = make(pit);
    run(sim, 20, aimAndRun);
    sim.step([{ type: 'jumpPress' }]);
    run(sim, 4);
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope?.taut).toBe(false); // rising toward the anchor: slack
    const vx = sim.snapshot().player.velocity.x;
    sim.step([{ type: 'move', axis: -1 }]);
    run(sim, 2);
    expect(sim.snapshot().rope?.taut).toBe(false);
    expect(sim.snapshot().player.velocity.x).toBeLessThan(vx - 1);
  });

  it('early and late connections give different swing radii', () => {
    const early = attachAt(5).snapshot().rope?.length ?? 0;
    const late = attachAt(25).snapshot().rope?.length ?? 0;
    expect(early - late).toBeGreaterThan(0.5);
  });

  it('different impact points on one anchor give different radii', () => {
    const lengths = [vec2(9, 1.7), vec2(9, 2.3)].map((aim) => {
      const sim = make(pit);
      sim.step([{ type: 'ropeAim', target: aim }]);
      run(sim, 10);
      sim.step([{ type: 'ropePress' }]);
      return sim.snapshot().rope?.length ?? 0;
    });
    expect(Math.abs((lengths[0] ?? 0) - (lengths[1] ?? 0))).toBeGreaterThan(0.2);
  });

  it('stays on the rope circle through the swing', () => {
    const sim = attachAt(20);
    untilLocked(sim);
    const length = sim.snapshot().rope?.length ?? 0;
    let maxStretch = 0;
    let lowest = -Infinity;
    for (let i = 0; i < 240; i++) {
      sim.step([]);
      const s = sim.snapshot();
      const d = Math.hypot(s.player.position.x - hook.x, s.player.position.y - hook.y);
      maxStretch = Math.max(maxStretch, d - length);
      lowest = Math.max(lowest, s.player.position.y);
    }
    expect(maxStretch).toBeLessThan(0.01);
    expect(lowest).toBeGreaterThan(hook.y + length - 0.05); // swung through the bottom
    expect(sim.snapshot().deaths).toBe(0);
  });

  it('release keeps the swing velocity (no canned launch)', () => {
    const sim = attachAt(20);
    run(sim, 50);
    const swingVelocity = sim.snapshot().player.velocity;
    sim.step([{ type: 'ropeRelease' }]);
    const release = sim.drainEvents().find((e) => e.type === 'ropeRelease') as
      { velocity: { x: number; y: number } } | undefined;
    expect(release?.velocity).toEqual(swingVelocity);
    expect(sim.snapshot().rope).toBeNull();
    // One tick later the body has only fallen under gravity from that velocity.
    const after = sim.snapshot().player.velocity;
    expect(after.x).toBeCloseTo(swingVelocity.x, 6);
  });

  it('an invalid press reports why, attaches nothing and does not retry while held', () => {
    const sim = make(pit);
    sim.step([{ type: 'ropeAim', target: vec2(30, -20) }, { type: 'ropePress' }]);
    run(sim, 30);
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'ropeInvalid')).toHaveLength(1);
    expect(events.find((e) => e.type === 'ropeInvalid')).toMatchObject({ reason: 'no-anchor' });
    expect(events.some((e) => e.type === 'ropeAttach')).toBe(false);
    expect(sim.snapshot().rope).toBeNull();
  });

  it('a second press while tethered does not re-shoot', () => {
    const sim = attachAt(20);
    untilLocked(sim);
    const length = sim.snapshot().rope?.length;
    run(sim, 10);
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope?.length).toBe(length);
    expect(sim.stats().physics.joints).toBe(1);
  });

  it('repeated attach and release never leaks constraints', () => {
    const sim = make(pit);
    sim.step([{ type: 'ropeAim', target: hook }]);
    for (let i = 0; i < 200; i++) {
      sim.step([{ type: 'ropePress' }]);
      expect(sim.stats().physics.joints).toBeLessThanOrEqual(1);
      sim.step([{ type: 'ropeRelease' }]);
      expect(sim.stats().physics.joints).toBe(0);
    }
  });

  it('death and restart remove the rope', () => {
    const sim = attachAt(20);
    expect(sim.stats().physics.joints).toBe(1);
    sim.step([{ type: 'restart' }]);
    expect(sim.snapshot().rope).toBeNull();
    expect(sim.stats().physics.joints).toBe(0);
  });

  it('steering cannot pump the swing beyond the energy budget', () => {
    const sim = make(pit);
    run(sim, 20, aimAndRun);
    const s0 = sim.snapshot().player;
    const e0 = 0.5 * (s0.velocity.x ** 2 + s0.velocity.y ** 2) - tuning.gravity * s0.position.y;
    sim.step([{ type: 'ropePress' }]);
    let axis = 1;
    let maxE = -Infinity;
    for (let i = 0; i < 1200; i++) {
      const v = sim.snapshot().player.velocity;
      const want = v.x >= 0 ? 1 : -1; // pump in time with the swing
      const intents: Intent[] = want !== axis ? [{ type: 'move', axis: want }] : [];
      axis = want;
      sim.step(intents);
      const p = sim.snapshot().player;
      const e = 0.5 * (p.velocity.x ** 2 + p.velocity.y ** 2) - tuning.gravity * p.position.y;
      maxE = Math.max(maxE, e);
    }
    expect(maxE).toBeLessThan(e0 + tuning.gravity * tuning.rope.steerEnergyHeight + 0.5);
  });

  it('the rope point follows a moving anchor', () => {
    const moving: LevelDef = {
      ...pit,
      anchors: [
        { id: 'm', position: vec2(9, 2), radius: 0.4, path: { to: vec2(12, 2), period: 3 } },
      ],
    };
    const sim = make(moving);
    sim.step([{ type: 'ropeAim', target: vec2(9.2, 2) }]);
    sim.step([{ type: 'ropePress' }]);
    const first = sim.snapshot();
    run(sim, 60);
    const later = sim.snapshot();
    const anchorMove = (later.anchors[0]?.x ?? 0) - (first.anchors[0]?.x ?? 0);
    expect(anchorMove).toBeGreaterThan(0.5);
    const offset = (first.rope?.point.x ?? 0) - (first.anchors[0]?.x ?? 0);
    expect(offset).toBeCloseTo(0.2, 2);
    expect((later.rope?.point.x ?? 0) - (later.anchors[0]?.x ?? 0)).toBeCloseTo(offset, 12);
  });
});

describe('death and reset loop', () => {
  /** Ledge, an anchor over a lava pit, a thorn hazard on the far side. */
  const deadly: LevelDef = {
    ...level,
    spawn: vec2(1, 7.65), // resting on the floor (radius 0.35)
    killY: 20,
    solids: [
      box('ledge', 0, 8, 4, 2),
      // High enough that a full swing from the ledge dips into it.
      box('lava', -10, 9.6, 60, 1, 'hazard'),
    ],
    anchors: [
      { id: 'hook', position: vec2(9, 2), radius: 0.4 },
      { id: 'slider', position: vec2(6, 0), radius: 0.4, path: { to: vec2(12, 0), period: 2 } },
    ],
  };

  it('death while tethered records the hazard, speed and rope, then clears the rope', () => {
    const sim = make(deadly);
    sim.step([
      { type: 'ropeAim', target: vec2(9, 2) },
      { type: 'move', axis: 1 },
    ]);
    run(sim, 20);
    sim.step([{ type: 'ropePress' }]);
    sim.step([{ type: 'jumpPress' }]);
    // Hold on with a long rope: the swing dips into the lava.
    let death: SimEvent | undefined;
    for (let i = 0; i < 400 && !death; i++) {
      sim.step([]);
      death = sim.drainEvents().find((e) => e.type === 'death');
    }
    expect(death).toMatchObject({ cause: 'hazard', solid: 'lava' });
    const last = sim.snapshot().lastDeath;
    expect(last?.rope?.anchor).toBe(0);
    expect(last?.rope?.length).toBeGreaterThan(0.8);
    expect(Math.hypot(last?.velocity.x ?? 0, last?.velocity.y ?? 0)).toBeGreaterThan(1);
    expect(sim.snapshot().rope).toBeNull();
    expect(sim.stats().physics.joints).toBe(0);
  });

  it('out-of-bounds death is machine-readable with no hazard id', () => {
    const open: LevelDef = { ...deadly, solids: [box('ledge', 0, 8, 4, 2)] };
    const sim = make(open);
    sim.step([{ type: 'move', axis: 1 }]);
    run(sim, 300);
    expect(sim.snapshot().lastDeath).toMatchObject({
      cause: 'out-of-bounds',
      solid: null,
      rope: null,
    });
  });

  it('control returns on the very next tick after death', () => {
    const sim = make(deadly);
    sim.step([{ type: 'move', axis: 1 }]);
    let ticks = 0;
    while (sim.snapshot().deaths === 0 && ticks++ < 600) sim.step([]);
    expect(sim.snapshot().attemptTick).toBe(0);
    sim.drainEvents();
    sim.step([{ type: 'jumpPress' }]);
    expect(sim.drainEvents().some((e) => e.type === 'jump')).toBe(true);
  });

  it('restores player, anchors and moving anchors to the authored state across 500 deaths', () => {
    const fresh = make(deadly);
    fresh.step([]);
    const authored = fresh.snapshot();
    const sim = make(deadly);
    const script = (i: number): Intent[][] => [
      [
        { type: 'ropeAim', target: vec2(9, 2) },
        { type: 'move', axis: 1 },
      ],
      [{ type: 'ropePress' }],
      [{ type: 'jumpPress' }],
      i % 2 ? [{ type: 'ropeRelease' }] : [],
    ];
    for (let i = 0; i < 500; i++) {
      const steps = script(i);
      let died = false;
      for (let t = 0; t < 600 && !died; t++) {
        sim.step(steps[t] ?? []);
        died = sim.drainEvents().some((e) => e.type === 'death');
      }
      expect(died).toBe(true);
      // Checked on the death tick itself: nothing of the attempt survives the reset.
      expect(sim.snapshot().rope).toBeNull();
      expect(sim.stats().physics.joints).toBe(0);
      expect(sim.snapshot().attemptTick).toBe(0);
    }
    // First tick of a new attempt matches a fresh simulation's first tick exactly.
    sim.step([{ type: 'move', axis: 0 }]);
    const after = sim.snapshot();
    expect(after.player.position).toEqual(authored.player.position);
    expect(after.player.velocity).toEqual(authored.player.velocity);
    expect(after.anchors).toEqual(authored.anchors);
    expect(sim.stats().entities).toBe(fresh.stats().entities);
  });

  it('a reset costs well under a millisecond', () => {
    const sim = make(deadly);
    run(sim, 10);
    const n = 2000;
    const start = performance.now();
    for (let i = 0; i < n; i++) sim.reset();
    const perReset = (performance.now() - start) / n;
    console.info(`reset cost: ${(perReset * 1000).toFixed(2)} µs`);
    expect(perReset).toBeLessThan(0.1);
  });
});

describe('debug instrumentation', () => {
  it('reports contacts begun this tick with the level solid id', () => {
    const sim = make({ ...level, spawn: vec2(2, 6) });
    let contacts: readonly { solid: string; normal: { y: number } }[] = [];
    for (let i = 0; i < 60 && contacts.length === 0; i++) {
      sim.step([]);
      contacts = sim.snapshot().contacts;
    }
    expect(contacts[0]?.solid).toBe('floor-a');
    expect(contacts[0]?.normal.y).toBeLessThan(-0.7);
  });

  it('retune applies new values live (dev panel)', () => {
    const sim = make();
    run(sim, 30);
    sim.retune({ ...tuning, player: { ...tuning.player, runSpeed: 3 } });
    run(sim, 60, () => [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().player.velocity.x).toBeCloseTo(3, 9);
  });
});
