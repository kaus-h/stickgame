import { describe, expect, it } from 'vitest';
import labCollision from '../../content/levels/lab-collision.json';
import { parseLevel } from '../../src/content';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { Simulation } from '../../src/sim';
import { SIM_TUNING } from './cases';
import { insideAny, R } from './harness';

describe('lab-collision level', () => {
  const level = parseLevel(labCollision);

  it('parses and carries every stress feature', () => {
    expect(level.id).toBe('lab-collision');
    const ids = new Set(level.solids.map((s) => s.id));
    for (const id of [
      'thin-wall',
      'thin-plank',
      'low-ceiling',
      'sharp-spire',
      'sharp-wedge',
      'tunnel-roof',
      'tight-roof',
      'conflict-wall',
      'hazard-strip',
      'thorns-release',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(level.anchors.map((a) => a.id)).toEqual(['a-pit', 'a-low', 'a-tucked', 'a-release']);
    expect(level.solids.some((s) => s.kind === 'hazard')).toBe(true);
  });

  it('spawns in free space and the main tunnel is passable', () => {
    expect(insideAny(level.spawn, level.solids)).toBe(false);
    const roof = level.solids.find((s) => s.id === 'tunnel-roof');
    const ground = level.solids.find((s) => s.id === 'ground-b');
    const gap = (ground?.points[0]?.y ?? 0) - (roof?.points[2]?.y ?? 0);
    expect(gap).toBeGreaterThan(2 * R + 0.05);
    const tight = level.solids.find((s) => s.id === 'tight-roof');
    const ledge = level.solids.find((s) => s.id === 'tight-ledge');
    expect((ledge?.points[0]?.y ?? 0) - (tight?.points[2]?.y ?? 0)).toBeLessThan(2 * R - 0.05);
  });

  it('runs 20 s of running and jumping without non-finite state', () => {
    const sim = new Simulation(SIM_TUNING, new KinematicPhysicsAdapter(), level);
    sim.step([{ type: 'move', axis: 1 }]);
    for (let i = 0; i < 1200; i++) {
      sim.step(
        i % 90 === 0 ? [{ type: 'jumpPress' }] : i % 90 === 20 ? [{ type: 'jumpRelease' }] : [],
      );
      const p = sim.snapshot().player.position;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});
