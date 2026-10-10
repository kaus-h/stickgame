import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import { getLevelTheme, LevelError, migrateLevel, parseLevel } from '../../src/content';
import { levelFingerprint } from '../../src/sim';

describe('per-level presentation theme (GMR-107)', () => {
  it('defaults levels without authored presentation metadata to paper', () => {
    const level = parseLevel(lab01);

    expect(level).not.toHaveProperty('theme');
    expect(getLevelTheme(level)).toBe('paper');
  });

  it('keeps an authored scenery theme through migration and compilation', () => {
    const authored = { ...lab01, version: 2, theme: 'scenery' };

    expect(migrateLevel(authored).theme).toBe('scenery');
    const level = parseLevel(authored);
    expect(level).not.toHaveProperty('theme');
    expect(getLevelTheme(level)).toBe('scenery');
  });

  it('rejects unsupported values at the level.theme path', () => {
    expect(() => parseLevel({ ...lab01, version: 2, theme: 'forest' })).toThrow('level.theme');
    expect(() => parseLevel({ ...lab01, version: 2, theme: null })).toThrow(LevelError);
    expect(() => parseLevel({ ...lab01, theme: 'scenery' })).toThrow('level.theme');
  });

  it('keeps presentation metadata out of the simulation level and replay fingerprint', () => {
    const plain = parseLevel(lab01);
    const themed = parseLevel({ ...lab01, version: 2, theme: 'scenery' });

    expect(themed).toEqual(plain);
    expect(levelFingerprint(themed)).toBe(levelFingerprint(plain));
  });
});
