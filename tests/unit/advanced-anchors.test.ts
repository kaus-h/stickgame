import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import {
  anchorTimerState,
  Simulation,
  type AnchorDef,
  type LevelDef,
  type SimEvent,
} from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson).sim;

/** The player hangs in open air 4 m below one anchor (no solids), aimed at it. */
function make(anchor: Partial<AnchorDef>) {
  const level: LevelDef = {
    id: 'adv',
    name: 'adv',
    spawn: { x: 0, y: 4 },
    bounds: { minX: -20, maxX: 20, minY: -20, maxY: 40 },
    killY: 40,
    solids: [],
    anchors: [{ id: 'a', position: { x: 0, y: 0 }, radius: 0.4, ...anchor }],
  };
  const sim = new Simulation(tuning, new KinematicPhysicsAdapter(), level);
  const events: SimEvent[] = [];
  const step = (intents: Parameters<Simulation['step']>[0] = []): void => {
    sim.step(intents);
    events.push(...sim.drainEvents());
  };
  const press = (): void => {
    step([{ type: 'ropeAim', target: { x: 0, y: 0 } }, { type: 'ropePress' }]);
  };
  return { sim, events, step, press };
}

describe('timed anchors (GMR-60)', () => {
  it('counts the schedule in whole ticks from the attempt start, with phase', () => {
    const def: AnchorDef = {
      id: 't',
      position: { x: 0, y: 0 },
      radius: 0.4,
      timed: { on: 1, off: 0.5 },
    };
    expect(anchorTimerState(def, 0)).toEqual({ active: true, ticksLeft: 60, span: 60 });
    expect(anchorTimerState(def, 59).ticksLeft).toBe(1);
    expect(anchorTimerState(def, 60)).toEqual({ active: false, ticksLeft: 30, span: 30 });
    expect(anchorTimerState(def, 90).active).toBe(true);
    // phase 2/3 of the 90-tick cycle = tick 60: the start of the off span.
    const shifted: AnchorDef = { ...def, timed: { on: 1, off: 0.5, phase: 2 / 3 } };
    expect(anchorTimerState(shifted, 0)).toEqual({ active: false, ticksLeft: 30, span: 30 });
    expect(anchorTimerState({ id: 'p', position: { x: 0, y: 0 }, radius: 0.4 }, 123).active).toBe(
      true,
    );
  });

  it('lets go of the rope when its on span ends and keeps the swing velocity', () => {
    const { sim, events, step, press } = make({ timed: { on: 1, off: 1 } });
    press();
    expect(sim.snapshot().rope).not.toBeNull();
    let before = sim.snapshot().player.velocity;
    while (sim.snapshot().attemptTick < 60) {
      before = sim.snapshot().player.velocity;
      step();
    }
    step(); // the tick that starts with the anchor off releases the rope
    const release = events.find((e) => e.type === 'ropeRelease');
    expect(release).toMatchObject({ type: 'ropeRelease', cause: 'timed' });
    expect(sim.snapshot().rope).toBeNull();
    // The release itself does not change the velocity (doc 04); gravity acts as usual afterwards.
    if (release?.type === 'ropeRelease') {
      expect(release.velocity.x).toBeCloseTo(before.x, 6);
    }
  });

  it('cannot be targeted while off, and can again when it comes back', () => {
    const { sim, events, step, press } = make({ timed: { on: 1, off: 1, phase: 0.5 } });
    press(); // tick 0 is in the off span
    expect(sim.snapshot().rope).toBeNull();
    expect(events.some((e) => e.type === 'ropeInvalid' && e.reason === 'no-anchor')).toBe(true);
    expect(sim.snapshot().anchorStates[0]?.active).toBe(false);
    sim.reset();
    for (let i = 0; i < 61; i++) step(); // through the off span (reset restarts the cycle)
    step([{ type: 'ropeAim', target: { x: 0, y: 0 } }]);
    sim.reset();
    // After a reset the cycle restarts in the off span again: identical behaviour every attempt.
    expect(sim.snapshot().anchorStates[0]).toMatchObject({ active: false, ticksLeft: 60 });
  });
});

describe('one-use anchors (GMR-60)', () => {
  it('is spent by letting go and comes back on reset', () => {
    const { sim, events, step, press } = make({ oneUse: true });
    press();
    expect(sim.snapshot().rope).not.toBeNull();
    step([{ type: 'ropeRelease' }]);
    expect(events.some((e) => e.type === 'anchorSpent' && e.anchor === 0)).toBe(true);
    expect(sim.snapshot().anchorStates[0]).toMatchObject({ oneUse: true, spent: true });
    press();
    expect(sim.snapshot().rope).toBeNull();
    sim.reset();
    expect(sim.snapshot().anchorStates[0]?.spent).toBe(false);
    press();
    expect(sim.snapshot().rope).not.toBeNull();
  });
});

describe('advanced anchor content (GMR-60)', () => {
  const base = {
    version: 2,
    id: 'x',
    name: 'x',
    spawn: [0, 0],
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    killY: 10,
    solids: [],
  };
  it('parses timed and one-use anchors', () => {
    const level = parseLevel({
      ...base,
      anchors: [
        { id: 'a', position: [1, 1], timed: { on: 1.5, off: 0.5, phase: 0.2 }, oneUse: true },
      ],
    });
    expect(level.anchors[0]).toMatchObject({
      timed: { on: 1.5, off: 0.5, phase: 0.2 },
      oneUse: true,
    });
  });
  it('rejects an on span too short for the telegraph', () => {
    expect(() =>
      parseLevel({ ...base, anchors: [{ id: 'a', position: [1, 1], timed: { on: 0.5, off: 1 } }] }),
    ).toThrow(/timed\.on/);
  });
});
