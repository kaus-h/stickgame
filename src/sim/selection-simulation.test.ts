import { describe, expect, it } from 'vitest';
import { distance, SIM_DT, vec2, type Intent } from '../core';
import runtime from '../../content/tuning/runtime.json';
import { KinematicPhysicsAdapter } from '../physics/backends/kinematic/KinematicPhysicsAdapter';
import { anchorPathState } from './anchorPath';
import { hashSnapshot } from './hash';
import type { LevelDef } from './level';
import { Simulation } from './Simulation';

const level: LevelDef = {
  id: 'selection',
  name: 'Selection',
  spawn: vec2(0, 4),
  bounds: { minX: -20, maxX: 20, minY: -20, maxY: 20 },
  killY: 21,
  anchors: [{ id: 'one', position: vec2(4, 0), radius: 0.4, path: { to: vec2(6, 0), period: 2 } }],
  solids: [],
};
const make = (mode: 'standard' | 'wide-select' | 'snap' = 'standard', l = level) =>
  new Simulation(runtime.sim, new KinematicPhysicsAdapter(), l, {
    assist: { mode, ...runtime.assist },
  });

describe('shared selection simulation', () => {
  it.each(['standard', 'wide-select', 'snap'] as const)(
    'locks centre distance on the moving connection tick (%s)',
    (mode) => {
      const sim = make(mode);
      for (let i = 0; i < 8; i++) sim.step([]);
      const before = sim.snapshot();
      const centre = anchorPathState(
        level.anchors[0] as (typeof level.anchors)[number],
        before.attemptTick * SIM_DT,
      ).position;
      sim.step([
        { type: 'ropeAim', target: vec2(centre.x + 0.3, centre.y) },
        { type: 'ropePress' },
      ]);
      expect(sim.snapshot().rope?.point).toEqual(sim.snapshot().anchors[0]);
      expect(sim.snapshot().rope?.length).toBe(distance(before.player.position, centre));
      expect(sim.snapshot().rope?.locked).toBe(true);
    },
  );
  it('a grounded connection pays out and locks centre distance only at take-off', () => {
    const floor: LevelDef = {
      ...level,
      anchors: [{ id: 'one', position: vec2(5, 0), radius: 0.4 }],
      solids: [
        {
          id: 'floor',
          kind: 'solid',
          points: [vec2(-10, 5), vec2(10, 5), vec2(10, 6), vec2(-10, 6)],
        },
      ],
    };
    const sim = make('standard', floor);
    for (let i = 0; i < 20; i++) sim.step([]);
    sim.step([
      { type: 'ropePoint', direction: vec2(0, 0) },
      { type: 'ropePress' },
      { type: 'move', axis: -1 },
    ]);
    expect(sim.snapshot().rope?.locked).toBe(false);
    for (let i = 0; i < 5; i++) sim.step([]);
    sim.step([{ type: 'jumpPress' }]);
    expect(sim.snapshot().rope?.locked).toBe(true);
    expect(sim.snapshot().rope?.length).toBe(
      distance(
        sim.snapshot().player.position,
        (floor.anchors[0] as (typeof floor.anchors)[number]).position,
      ),
    );
  });
  it('button neutral and explicit tap picks share the same highlight and centre grab', () => {
    const sim = make();
    sim.step([{ type: 'ropeNeutral' }]);
    expect(sim.snapshot().target).toMatchObject({ valid: true, anchor: 0 });
    sim.step([{ type: 'ropePress' }]);
    expect(sim.snapshot().rope?.anchor).toBe(0);
    const tap = make();
    tap.step([{ type: 'ropeTouch', target: vec2(4 + 0.4 + 1.7, 0) }]);
    expect(tap.snapshot().rope).toBeNull();
    expect(tap.snapshot().target).toMatchObject({ valid: true, anchor: 0 });
    for (let i = 0; i < 25; i++) tap.step([]);
    // The last tap stores an anchor identity, even as its centre moves away from the tap.
    tap.step([{ type: 'ropePress' }]);
    expect(tap.snapshot().rope?.point).toEqual(tap.snapshot().anchors[0]);
    const direct = make();
    direct.step([{ type: 'ropeTouch', target: vec2(4, 0) }, { type: 'ropePress' }]);
    expect(direct.snapshot().rope?.anchor).toBe(0);
    const miss = make();
    miss.step([{ type: 'ropeTouch', target: vec2(-12, -12) }, { type: 'ropePress' }]);
    expect(miss.snapshot().rope).toBeNull();
    expect(miss.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'ropeInvalid', reason: 'no-anchor' }),
    );
  });
  it('identical intents produce identical state hashes regardless of snapshot reads', () => {
    const a = make(),
      b = make();
    for (let tick = 0; tick < 90; tick++) {
      const intents: Intent[] =
        tick === 0
          ? [{ type: 'ropePoint', direction: vec2(1, -1) }]
          : tick === 12
            ? [{ type: 'ropePress' }]
            : tick === 30
              ? [{ type: 'ropeRelease' }]
              : tick === 40
                ? [{ type: 'ropeTouch', target: vec2(5, 0) }]
                : [];
      a.snapshot();
      a.snapshot();
      a.step(intents);
      b.step(intents);
      expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    }
  });
});
