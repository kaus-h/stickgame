import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import { validateLevelAuthoring } from '../../src/content/validate-level';

function fixture(target: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    id: 'impact-content',
    name: 'Impact content',
    spawn: [2, 7.65],
    bounds: { minX: 0, minY: -8, maxX: 30, maxY: 12 },
    killY: 13,
    solids: [{ id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } }],
    anchors: [{ id: 'anchor', position: [7, 2] }],
    targets: [{ id: 'target', position: [10, 7.35], ...target }],
  };
}

describe('swing-impact target content', () => {
  it('adds optional targets without changing legacy levels and supplies target defaults', () => {
    const json = fixture();
    expect(parseLevel(json).targets).toEqual([
      { id: 'target', position: { x: 10, y: 7.35 }, radius: 0.6, hp: 1 },
    ]);
    delete json.targets;
    expect(parseLevel(json).targets).toBeUndefined();
    json.version = 1;
    expect(parseLevel(json).targets).toBeUndefined();
  });

  it('preserves overrides, wrapped and signed approach windows, and anchor-shaped paths', () => {
    const level = parseLevel(
      fixture({
        radius: 0.8,
        hp: 3,
        minSpeed: 12,
        approach: { min: 170, max: -170 },
        path: { to: [12, 7.35], period: 4, phase: 0.25 },
      }),
    );
    expect(level.targets?.[0]).toEqual({
      id: 'target',
      position: { x: 10, y: 7.35 },
      radius: 0.8,
      hp: 3,
      minSpeed: 12,
      approach: { min: 170, max: -170 },
      path: { to: { x: 12, y: 7.35 }, period: 4, phase: 0.25 },
    });
    expect(() => parseLevel(fixture({ approach: { min: 350, max: 10 } }))).not.toThrow();
    expect(() => parseLevel(fixture({ approach: { min: -180, max: 180 } }))).not.toThrow();
  });

  it.each([
    [{ radius: 0 }, 'radius'],
    [{ hp: 0 }, 'hp'],
    [{ hp: 1.5 }, 'hp'],
    [{ minSpeed: -1 }, 'minSpeed'],
    [{ approach: { min: 'left', max: 20 } }, 'approach.min'],
    [{ approach: { min: 0 } }, 'approach.max'],
    [{ approach: { min: -361, max: 0 } }, 'approach'],
    [{ approach: { min: 0, max: Infinity } }, 'approach.max'],
    [{ path: { to: [12, 7], period: 0 } }, 'path.period'],
    [{ path: { to: [12, 7], period: 4, phase: 1 } }, 'path.phase'],
    [{ path: { to: [25, 7], period: 1 } }, 'path'],
    [{ attackButton: true }, 'attackButton'],
  ])('reports clear paths for invalid target %j', (target, path) => {
    expect(() => parseLevel(fixture(target))).toThrow(`level.targets[0].${path}`);
    expect(validateLevelAuthoring(fixture(target))[0]?.severity).toBe('error');
  });

  it('rejects ids shared with other level objects or targets', () => {
    expect(() => parseLevel(fixture({ id: 'anchor' }))).toThrow('duplicate id "anchor"');
    const json = fixture();
    (json.targets as unknown[]).push({ id: 'target', position: [15, 7] });
    expect(() => parseLevel(json)).toThrow('duplicate id "target"');
  });

  it('accepts the largest exactly decrementable hp and rejects unsafe integers', () => {
    expect(parseLevel(fixture({ hp: Number.MAX_SAFE_INTEGER })).targets?.[0]?.hp).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => parseLevel(fixture({ hp: Number.MAX_SAFE_INTEGER + 1 }))).toThrow(
      'level.targets[0].hp',
    );
  });

  it('validates the entire target body and moving path against bounds and the kill plane', () => {
    const errors = validateLevelAuthoring(
      fixture({ position: [29.8, 7], path: { to: [29.8, 12.8], period: 8 } }),
    );
    expect(errors.some((issue) => issue.message.includes('target body and path'))).toBe(true);
    expect(errors.some((issue) => issue.message.includes('kill plane'))).toBe(true);
    expect(validateLevelAuthoring(fixture())).toEqual([]);
  });
});

describe('impact combat tuning', () => {
  it('parses the authored combat defaults and overrides into simulation tuning', () => {
    expect(parseRuntimeTuning(runtimeJson).sim.combat).toEqual({
      minImpactSpeed: 9,
      restitution: 0.5,
    });
    expect(
      parseRuntimeTuning({ ...runtimeJson, combat: { minImpactSpeed: 12, restitution: 0.7 } }).sim
        .combat,
    ).toEqual({ minImpactSpeed: 12, restitution: 0.7 });
  });

  it('supplies defaults when a legacy tuning file omits combat', () => {
    const json: Record<string, unknown> = { ...runtimeJson };
    delete json.combat;
    expect(parseRuntimeTuning(json).sim.combat).toEqual({ minImpactSpeed: 9, restitution: 0.5 });
  });

  it.each([
    [null, 'combat must be an object'],
    [{ minImpactSpeed: -1, restitution: 0.5 }, 'combat.minImpactSpeed'],
    [{ minImpactSpeed: Infinity, restitution: 0.5 }, 'combat.minImpactSpeed'],
    [{ minImpactSpeed: 9, restitution: -0.1 }, 'combat.restitution'],
    [{ minImpactSpeed: 9, restitution: 1.1 }, 'combat.restitution'],
  ])('rejects invalid combat tuning %j with its path', (combat, path) => {
    expect(() => parseRuntimeTuning({ ...runtimeJson, combat })).toThrow(path);
  });
});
