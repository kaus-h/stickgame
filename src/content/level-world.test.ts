import { describe, expect, it } from 'vitest';
import firstRope from '../../content/levels/1-1.json';
import release from '../../content/levels/1-2.json';
import firstThreat from '../../content/levels/1-3.json';
import movingPivots from '../../content/levels/2-1.json';
import lab01 from '../../content/levels/lab-01.json';
import { compileLevel, getLevelTheme, getLevelWorld, migrateLevel } from './index';

describe('world presentation metadata (GMR-120)', () => {
  it('defaults legacy levels and manually constructed definitions to notebook', () => {
    const level = compileLevel(lab01);
    expect(getLevelWorld(level)).toEqual({ family: 'notebook' });
    expect(getLevelWorld({ ...level })).toEqual({ family: 'notebook' });
    expect(level).not.toHaveProperty('world');
  });

  it('preserves authored family and sub-theme without changing compiled gameplay data', () => {
    const source = {
      ...lab01,
      version: 2,
      world: { family: 'jungle', subTheme: 'canopy' },
      theme: 'scenery',
    };
    const level = compileLevel(source);
    expect(getLevelWorld(level)).toEqual({ family: 'jungle', subTheme: 'canopy' });
    expect(getLevelTheme(level)).toBe('scenery');
    expect(level).toEqual(compileLevel(lab01));
    expect(JSON.stringify(level)).toBe(JSON.stringify(compileLevel(lab01)));
    expect(migrateLevel(source).world).toEqual(source.world);
    source.world.family = 'changed';
    expect(getLevelWorld(level).family).toBe('jungle');
    expect(Object.isFrozen(getLevelWorld(level))).toBe(true);
  });

  it('accepts future world IDs without a renderer registry requirement', () => {
    const level = compileLevel({ ...lab01, world: { family: 'future-world' } });
    expect(getLevelWorld(level)).toEqual({ family: 'future-world' });
    expect(getLevelWorld(level)).not.toHaveProperty('subTheme');
    expect(getLevelTheme(level)).toBe('paper');
  });

  it.each([
    [null, 'level.world'],
    [{}, 'level.world.family'],
    [{ family: '' }, 'level.world.family'],
    [{ family: 1 }, 'level.world.family'],
    [{ family: 'notebook', subTheme: '' }, 'level.world.subTheme'],
    [{ family: 'notebook', subTheme: null }, 'level.world.subTheme'],
    [{ family: 'notebook', subTheme: 1 }, 'level.world.subTheme'],
    [{ family: 'notebook', unknown: 'field' }, 'level.world.unknown'],
  ])('rejects malformed world metadata %j at %s', (world, path) => {
    expect(() => compileLevel({ ...lab01, world })).toThrow(path);
  });

  it('ships the four existing content levels with the notebook world', () => {
    for (const source of [firstRope, release, firstThreat, movingPivots]) {
      expect(source.world).toEqual({ family: 'notebook' });
      expect(getLevelWorld(compileLevel(source))).toEqual({ family: 'notebook' });
    }
  });
});
