import { describe, expect, it } from 'vitest';
import lab from '../../content/levels/lab-01.json';
import { LevelRegistry } from '../../src/content/level-registry';

describe('level registry', () => {
  it('lists stable IDs in order and selects by ID rather than filename', () => {
    const registry = new LevelRegistry({ b: { ...lab, id: 'z' }, a: lab });
    expect(registry.ids).toEqual(['lab-01', 'z']);
    expect(registry.load('z').id).toBe('z');
    expect(() => registry.load('missing')).toThrow(/missing.*lab-01.*z/);
  });

  it('rejects duplicate IDs and validates a replacement before exposing it', () => {
    expect(() => new LevelRegistry({ a: lab, b: lab })).toThrow(/duplicate.*lab-01/);
    const registry = new LevelRegistry({ a: lab });
    expect(() => {
      registry.replace({ a: { ...lab, spawn: ['bad', 0] } });
    }).toThrow();
    expect(registry.load('lab-01').spawn.x).toBe(3);
  });

  it('rejects a schema-valid v2 spawn without a resting floor', () => {
    expect(() => new LevelRegistry({ a: { ...lab, version: 2, spawn: [3, 4] } })).toThrow(/spawn/);
  });

  it('rejects conflicting telemetry IDs across otherwise distinct levels', () => {
    expect(
      () =>
        new LevelRegistry({
          a: lab,
          b: { ...lab, id: 'second', telemetry: { levelId: lab.id } },
        }),
    ).toThrow(/duplicate.*telemetry/);
  });
});
