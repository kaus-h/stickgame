import { describe, expect, it } from 'vitest';
import wide from '../../content/levels/lab-exit-wide.json';
import slot from '../../content/levels/lab-exit-slot.json';
import shaft from '../../content/levels/lab-exit-shaft.json';
import { compileLevel, migrateLevel, validateLevelSchema } from './level';
import { validateLevelAuthoring } from './validate-level';

describe('authored compartment exits', () => {
  it.each([wide, slot, shaft])('compiles and validates the $id lab', (json) => {
    expect(compileLevel(json).exit).toEqual({
      ...json.exit,
      min: { x: json.exit.min[0], y: json.exit.min[1] },
      max: { x: json.exit.max[0], y: json.exit.max[1] },
    });
    expect(validateLevelAuthoring(json).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('preserves bare box compatibility on both schema versions without inferring a family', () => {
    const exit = { min: [10, 5], max: [15, 8] };
    for (const version of [1, 2]) {
      const json = { ...wide, version, exit };
      expect(migrateLevel(json).exit).toEqual(exit);
      expect(compileLevel(json).exit).toEqual({ min: { x: 10, y: 5 }, max: { x: 15, y: 8 } });
    }
  });

  it('allows typed exits only in v2 and requires the complete contract', () => {
    expect(() => {
      validateLevelSchema({ ...wide, version: 1 });
    }).toThrow('level.exit');
    const withoutId: Partial<typeof wide.exit> = { ...wide.exit };
    delete withoutId.id;
    expect(() => {
      validateLevelSchema({ ...wide, exit: withoutId });
    }).toThrow('level.exit.id');
    expect(() => {
      validateLevelSchema({ ...wide, exit: { min: [10, 5], max: [15, 8], family: 'wide' } });
    }).toThrow('level.exit');
    expect(() => {
      validateLevelSchema({ ...wide, exit: { ...wide.exit, unexpected: true } });
    }).toThrow('level.exit.unexpected');
    expect(() => {
      validateLevelSchema({
        ...wide,
        exit: { ...wide.exit, entry: { ...wide.exit.entry, speed: { min: -1, max: 8 } } },
      });
    }).toThrow('level.exit.entry.speed.min');
    expect(() => {
      validateLevelSchema({
        ...wide,
        exit: { ...wide.exit, entry: { ...wide.exit.entry, angle: { min: 0, max: 91 } } },
      });
    }).toThrow('level.exit.entry.angle.max');
    expect(() => {
      validateLevelSchema({
        ...wide,
        exit: { ...wide.exit, entry: { ...wide.exit.entry, alignment: { min: 0, max: 1.1 } } },
      });
    }).toThrow('level.exit.entry.alignment.max');
  });

  it.each(['angle', 'speed', 'alignment'])(
    'rejects reversed %s windows at the authoring path',
    (key) => {
      expect(() =>
        compileLevel({
          ...wide,
          exit: { ...wide.exit, entry: { ...wide.exit.entry, [key]: { min: 0.8, max: 0.2 } } },
        }),
      ).toThrow(`level.exit.entry.${key}: min must not exceed max`);
    },
  );

  it('requires horizontal slots and vertical shafts', () => {
    expect(() =>
      compileLevel({ ...slot, exit: { ...slot.exit, entry: { ...slot.exit.entry, side: 'top' } } }),
    ).toThrow('level.exit.entry.side');
    expect(() =>
      compileLevel({
        ...shaft,
        exit: { ...shaft.exit, entry: { ...shaft.exit.entry, side: 'left' } },
      }),
    ).toThrow('level.exit.entry.side');
  });

  it('rejects zero-speed and exact-grazing-only ingress windows', () => {
    expect(() => {
      validateLevelSchema({
        ...wide,
        exit: { ...wide.exit, entry: { ...wide.exit.entry, speed: { min: 0, max: 0 } } },
      });
    }).toThrow('level.exit.entry.speed.max');
    expect(() => {
      compileLevel({
        ...wide,
        exit: { ...wide.exit, entry: { ...wide.exit.entry, angle: { min: 90, max: 90 } } },
      });
    }).toThrow('level.exit.entry.angle.min');
    for (const entry of [
      { ...wide.exit.entry, speed: { min: 0, max: 0 } },
      { ...wide.exit.entry, angle: { min: 90, max: 90 } },
    ]) {
      const issues = validateLevelAuthoring({ ...wide, exit: { ...wide.exit, entry } });
      expect(issues.some((issue) => issue.severity === 'error')).toBe(true);
    }
  });

  it('checks stable exit IDs against other authored entities', () => {
    expect(() => compileLevel({ ...wide, exit: { ...wide.exit, id: 'floor' } })).toThrow(
      'level.exit.id: duplicate id',
    );
  });

  it('rejects narrow apertures and alignment windows that cannot accommodate the circle', () => {
    const narrow = { ...slot, exit: { ...slot.exit, min: [10, 7.3] } };
    expect(
      validateLevelAuthoring(narrow).some(
        (issue) => issue.path === 'level.exit.entry' && issue.message.includes('0.8 m'),
      ),
    ).toBe(true);
    const impossible = {
      ...slot,
      exit: { ...slot.exit, entry: { ...slot.exit.entry, alignment: { min: 0, max: 0.2 } } },
    };
    expect(
      validateLevelAuthoring(impossible).some(
        (issue) => issue.path === 'level.exit.entry.alignment',
      ),
    ).toBe(true);
  });

  it('rejects blocked mouths even when the compartment interior remains clear', () => {
    const json = {
      ...wide,
      solids: [...wide.solids, { id: 'mouth-wall', rect: { x: 9.9, y: 4, w: 0.2, h: 4 } }],
    };
    expect(
      validateLevelAuthoring(json).some(
        (issue) =>
          issue.path === 'level.exit.entry' && issue.message.includes('collision-clear ingress'),
      ),
    ).toBe(true);
  });

  it('does not allow spawn inside a typed compartment', () => {
    expect(
      validateLevelAuthoring({ ...wide, spawn: [12, 7.65] }).some(
        (issue) =>
          issue.path === 'level.spawn' && issue.message.includes('outside the authored exit'),
      ),
    ).toBe(true);
  });
});
