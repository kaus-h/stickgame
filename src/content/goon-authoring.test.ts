import { describe, expect, it } from 'vitest';
import lab from '../../content/levels/lab-goon.json';
import contact from '../../content/levels/lab-goon-contact.json';
import drop from '../../content/levels/lab-goon-drop.json';
import { compileLevel, migrateLevel, validateLevelSchema } from './level';
import { validateLevelAuthoring } from './validate-level';

const enemy = lab.enemies[0];
if (!enemy) throw new Error('patroller lab fixture must contain an enemy');
const withEnemy = (changes: Record<string, unknown>) => ({
  ...lab,
  enemies: [{ ...enemy, ...changes }],
});
const messages = (json: unknown) =>
  validateLevelAuthoring(json).map((issue) => `${issue.path}: ${issue.message}`);

describe('v2 patroller authoring', () => {
  it.each([lab, contact, drop])('loads and validates $id', (json) => {
    expect(compileLevel(json).enemies?.[0]?.size).toEqual({ x: 1.2, y: 1 });
    expect(validateLevelAuthoring(json).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
  it('preserves absent enemies and v1 migration without synthesizing entities', () => {
    const json: Record<string, unknown> = { ...lab, version: 1 };
    delete json.enemies;
    expect(compileLevel(json).enemies).toBeUndefined();
    expect(migrateLevel(json).enemies).toBeUndefined();
    expect(() => {
      validateLevelSchema({ ...lab, version: 1 });
    }).toThrow('level.enemies');
  });
  it('requires explicit stomp tuning and rejects unknown shape and kind', () => {
    for (const changes of [{ kind: 'boss' }, { invented: true }, { stomp: { minDownSpeed: 1 } }]) {
      expect(() => {
        validateLevelSchema(withEnemy(changes));
      }).toThrow('level.enemies[0]');
    }
    for (const changes of [{ minDownSpeed: 0 }, { reboundSpeed: -1 }, { topInset: 0.1 }]) {
      expect(() => {
        validateLevelSchema(withEnemy({ stomp: { ...enemy.stomp, ...changes } }));
      }).toThrow('level.enemies[0].stomp');
    }
  });
  it('rejects nonpositive body dimensions', () => {
    expect(() => compileLevel(withEnemy({ size: [0, 1] }))).toThrow('level.enemies[0].size');
  });
  it('requires horizontal paths with peak speed at most 3 m/s and valid phase', () => {
    expect(() => compileLevel(withEnemy({ path: { to: [9, 7], period: 6 } }))).toThrow(
      'level.enemies[0].path.to',
    );
    expect(() => compileLevel(withEnemy({ path: { to: [19, 7.5], period: 6 } }))).toThrow(
      'peak patrol speed exceeds 3',
    );
    expect(() => compileLevel(withEnemy({ path: { ...enemy.path, phase: 1 } }))).toThrow(
      'level.enemies[0].path.phase',
    );
  });
  it('rejects duplicate IDs across content entities', () => {
    expect(() => compileLevel(withEnemy({ id: 'floor' }))).toThrow('duplicate id');
  });
  it('checks full-size patrol bounds and nonoverlap with spawn', () => {
    expect(
      messages(withEnemy({ position: [0.2, 7.5], path: { to: [1, 7.5], period: 6 } })).some(
        (message) => message.includes('inside bounds'),
      ),
    ).toBe(true);
    expect(
      messages(withEnemy({ position: [2, 7.5], path: undefined })).some((message) =>
        message.includes('level.spawn: player circle overlaps'),
      ),
    ).toBe(true);
  });
  it('requires continuous safe floor support rather than endpoint samples', () => {
    const json = {
      ...lab,
      solids: [
        { id: 'left', rect: { x: 0, y: 8, w: 7.95, h: 2 } },
        { id: 'right', rect: { x: 8.05, y: 8, w: 15.95, h: 2 } },
      ],
    };
    expect(
      messages(json).some((message) =>
        message.includes('continuous safe horizontal floor support'),
      ),
    ).toBe(true);
    expect(
      messages({ ...lab, solids: lab.solids.map((solid) => ({ ...solid, kind: 'hazard' })) }).some(
        (message) => message.includes('continuous safe horizontal floor support'),
      ),
    ).toBe(true);
  });
  it('detects collision between patrol samples and preserves floor tangency', () => {
    const json = {
      ...lab,
      solids: [...lab.solids, { id: 'thin-wall', rect: { x: 8, y: 6, w: 0.1, h: 2 } }],
    };
    expect(
      messages(json).some((message) => message.includes('patroller swept body overlaps')),
    ).toBe(true);
    expect(messages(lab)).toEqual([]);
  });
});
