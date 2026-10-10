import { describe, expect, it } from 'vitest';
import miss from '../../content/levels/lab-exit-miss.json';
import { compileLevel } from '../../src/content/level';
import { evaluateExitEntry } from '../../src/sim/exits';
import type { ExitDef } from '../../src/sim/level';

const opening: ExitDef = {
  id: 'slot-a',
  family: 'slot',
  min: { x: 0, y: 0 },
  max: { x: 1, y: 2 },
  entry: {
    side: 'left',
    angle: { min: 0, max: 45 },
    speed: { min: 1, max: 200 },
    alignment: { min: 0.2, max: 0.8 },
  },
};
describe('swept compartment entry', () => {
  it.each(['wide', 'slot', 'shaft'] as const)(
    'detects a 160 m/s crossing entirely through %s',
    (family) => {
      const vertical = family === 'shaft';
      const exit: ExitDef = {
        ...opening,
        family,
        entry: { ...opening.entry, side: vertical ? 'top' : 'left' },
      };
      const result = evaluateExitEntry(
        exit,
        vertical ? { x: 0.5, y: -0.3 } : { x: -0.3, y: 1 },
        vertical ? { x: 0.5, y: 2.3 } : { x: 2.3, y: 1 },
        vertical ? { x: 0, y: 160 } : { x: 160, y: 0 },
        0.3,
      );
      expect(result?.accepted).toBe(true);
      expect(result?.speed).toBe(160);
    },
  );
  it.each([12, 0.5])('accepts %s m/s when entry.speed is absent', (speed) => {
    const exit: ExitDef = {
      ...opening,
      entry: {
        side: 'left',
        angle: { min: 0, max: 45 },
        alignment: { min: 0.2, max: 0.8 },
      },
    };
    const attempt = evaluateExitEntry(
      exit,
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: speed, y: 0 },
      0.3,
    );
    expect(attempt?.accepted).toBe(true);
    expect(attempt?.reason).toBeNull();
    expect(attempt?.speed).toBe(speed);
  });
  it('keeps the explicit lab-exit-miss speed rejection', () => {
    const exit = compileLevel(miss).exit;
    if (!exit || !('entry' in exit)) throw new Error('expected typed exit');
    expect(
      evaluateExitEntry(exit, { x: 9, y: 6.5 }, { x: 11, y: 6.5 }, { x: 12, y: 0 }, 0.3)?.reason,
    ).toBe('speed');
  });
  it('reports a reversed-side entry and ignores outbound movement', () => {
    expect(
      evaluateExitEntry(opening, { x: 2, y: 1 }, { x: 0.5, y: 1 }, { x: -10, y: 0 }, 0.3)?.reason,
    ).toBe('wrong-side');
    expect(
      evaluateExitEntry(opening, { x: 0.5, y: 1 }, { x: -1, y: 1 }, { x: -10, y: 0 }, 0.3),
    ).toBeNull();
  });
  it('accepts inclusive speed, angle and alignment boundaries', () => {
    const exit = {
      ...opening,
      entry: {
        ...opening.entry,
        speed: { min: Math.sqrt(2), max: Math.sqrt(2) },
        alignment: { min: 0.5, max: 0.5 },
        angle: { min: 45, max: 45 },
      },
    };
    expect(
      evaluateExitEntry(exit, { x: -1, y: 0 }, { x: 1, y: 2 }, { x: 1, y: 1 }, 0.3)?.accepted,
    ).toBe(true);
  });
  it('rejects aperture grazing, angle, speed and alignment independently', () => {
    const run = (y: number, v = { x: 10, y: 0 }) =>
      evaluateExitEntry(opening, { x: -1, y }, { x: 1, y }, v, 0.3);
    expect(run(0.29)?.reason).toBe('clearance');
    expect(run(1, { x: 1, y: 10 })?.reason).toBe('angle');
    expect(run(1, { x: 0.5, y: 0 })?.reason).toBe('speed');
    expect(run(0.35)?.reason).toBe('alignment');
    expect(
      evaluateExitEntry(opening, { x: -1, y: 3 }, { x: 1, y: 3 }, { x: 10, y: 0 }, 0.3),
    ).toBeNull();
  });
  it('rejects corners and exact-boundary tangency, accepts a radius-clear endpoint', () => {
    expect(
      evaluateExitEntry(opening, { x: -1, y: -1 }, { x: 1, y: 1 }, { x: 10, y: 10 }, 0.3)?.reason,
    ).toBe('clearance');
    expect(
      evaluateExitEntry(opening, { x: 0, y: 0.5 }, { x: 0, y: 1.5 }, { x: 0, y: 10 }, 0.3),
    ).toBeNull();
    const noAlignment = { ...opening, entry: { ...opening.entry, alignment: { min: 0, max: 1 } } };
    expect(
      evaluateExitEntry(noAlignment, { x: -1, y: 0.3 }, { x: 0, y: 0.3 }, { x: 10, y: 0 }, 0.3)
        ?.accepted,
    ).toBe(true);
  });
  it('rejects a crossing whose solver arrival velocity reversed away from the opening', () => {
    expect(
      evaluateExitEntry(opening, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: -10, y: 0 }, 0.3)?.reason,
    ).toBe('wrong-side');
  });
  it('counts arrival exactly at the entry boundary once, without another t=0 entry', () => {
    const first = evaluateExitEntry(opening, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 10, y: 0 }, 0.3);
    const next = evaluateExitEntry(opening, { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 10, y: 0 }, 0.3);
    expect(first?.accepted).toBe(true);
    expect(next).toBeNull();
  });
});
