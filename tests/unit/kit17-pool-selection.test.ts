import { describe, expect, it } from 'vitest';
import type { LevelDef, SolidDef } from '../../src/sim';
import { selectKit17PoolParts } from '../../src/render/kit/Kit17Pool';

const pool: SolidDef = {
  id: 'pool',
  kind: 'hazard',
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 0, y: 2 },
  ],
};
const solid = (id: string, points: SolidDef['points']): SolidDef => ({ id, kind: 'solid', points });
const level = (solids: readonly SolidDef[]): LevelDef => ({
  id: 'test',
  name: 'test',
  spawn: { x: 1, y: -1 },
  bounds: { minX: -2, minY: -2, maxX: 6, maxY: 4 },
  killY: 4,
  solids,
  anchors: [],
});

describe('kit 0017 pool bank selection', () => {
  it('chooses only genuinely adjoining left/right vertical banks and their inner turns', () => {
    const left = solid('left', [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
    ]);
    const right = solid('right', [
      { x: 4, y: -1 },
      { x: 5, y: -1 },
      { x: 5, y: 1 },
      { x: 4, y: 1 },
    ]);
    const selected = selectKit17PoolParts(level([pool, left, right]), pool);
    expect(selected.left?.name).toBe('t35-pool-left-wall-join');
    expect(selected.right?.name).toBe('t36-pool-right-wall-join');
    expect(selected.leftCorner?.name).toBe('t37-pool-inner-left-corner');
    expect(selected.rightCorner?.name).toBe('t38-pool-inner-right-corner');
  });

  it('rejects nearby bounds without a shared vertical edge and always retains surface/depth', () => {
    const nearby = solid('nearby', [
      { x: -1, y: 0 },
      { x: -0.1, y: 0 },
      { x: -0.1, y: 1 },
      { x: -1, y: 1 },
    ]);
    const selected = selectKit17PoolParts(level([pool, nearby]), pool);
    expect(selected.surface.name).toBe('t34-pool-surface-span');
    expect(selected.depth.name).toBe('t39-pool-depth-fill');
    expect(selected.left).toBeUndefined();
    expect(selected.right).toBeUndefined();
    expect(selected.leftCorner).toBeUndefined();
    expect(selected.rightCorner).toBeUndefined();
  });
});
