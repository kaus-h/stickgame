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
function make(anchor: Partial<AnchorDef>, spawn = { x: 0, y: 4 }, checkpoint = false) {
  const level: LevelDef = {
    id: 'adv',
    name: 'adv',
    spawn,
    ...(checkpoint ? { checkpoints: [{ id: 'cp', position: spawn }] } : {}),
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

  it('lets go of the rope on the tick its on span ends, keeping the swing velocity', () => {
    // Start 3 m to the side so the release happens mid-swing, with speed on both axes.
    const { sim, events, step, press } = make({ timed: { on: 1, off: 1 } }, { x: 3, y: 4 });
    press();
    expect(sim.snapshot().rope).not.toBeNull();
    while (sim.snapshot().attemptTick < 60) step();
    // Same tick: the snapshot never shows an off anchor still holding the rope.
    const snap = sim.snapshot();
    expect(snap.anchorStates[0]?.active).toBe(false);
    expect(snap.rope).toBeNull();
    const release = events.find((e) => e.type === 'ropeRelease');
    expect(release).toMatchObject({ type: 'ropeRelease', cause: 'timed' });
    if (release?.type !== 'ropeRelease') throw new Error('no release');
    expect(Math.abs(release.velocity.x)).toBeGreaterThan(0.5);
    expect(Math.abs(release.velocity.y)).toBeGreaterThan(0.5);
    // The release itself leaves the velocity exactly as the swing had it (doc 04).
    expect(snap.player.velocity.x).toBe(release.velocity.x);
    expect(snap.player.velocity.y).toBe(release.velocity.y);
  });

  it('cannot be targeted while off, can be again once it is back, and restarts on reset', () => {
    const { sim, events, step, press } = make({ timed: { on: 1, off: 0.25, phase: 0.8 } });
    press(); // tick 0 is in the 15-tick off span (short, so the falling player stays in reach)
    expect(sim.snapshot().rope).toBeNull();
    expect(events.some((e) => e.type === 'ropeInvalid' && e.reason === 'no-anchor')).toBe(true);
    expect(sim.snapshot().anchorStates[0]?.active).toBe(false);
    while (sim.snapshot().anchorStates[0]?.active !== true) step();
    press();
    expect(sim.snapshot().rope?.anchor).toBe(0);
    sim.reset();
    expect(sim.snapshot().anchorStates[0]).toMatchObject({ active: false, ticksLeft: 15 });
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

describe('one-use anchors on checkpoint respawn (GMR-60)', () => {
  it('a voluntary respawn restores spent anchors and restarts timers', () => {
    const { sim, step, press } = make({ oneUse: true }, { x: 0, y: 4 }, true);
    step(); // standing in the checkpoint trigger activates it
    press();
    step([{ type: 'ropeRelease' }]);
    expect(sim.snapshot().anchorStates[0]?.spent).toBe(true);
    step([{ type: 'respawn' }]);
    expect(sim.snapshot().anchorStates[0]?.spent).toBe(false);
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
