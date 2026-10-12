import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/content';
import { evaluateExitEntry } from '../../src/sim/exits';

/**
 * Owner ruling (2026-10-12): an exit you physically reach always takes you. No chapter level may
 * reject an arrival for being too slow or too fast, at the wrong angle, or off-centre in the
 * opening; that sent players back from the end of 1-3. Rejecting exits stay in labs only.
 */
const root = join(__dirname, '..', '..', 'content', 'levels');
const chapter = readdirSync(root).filter((f) => /^\d-\d\.json$/.test(f));

describe('chapter exits always accept a reached exit', () => {
  it.each(chapter)('%s', (file) => {
    const level = parseLevel(JSON.parse(readFileSync(join(root, file), 'utf8')));
    const exit = level.exit;
    expect(exit).toBeDefined();
    if (!exit || !('entry' in exit)) return; // a bare box exit has no entry rules at all
    expect(exit.entry.speed).toBeUndefined();
    expect(exit.entry.angle).toEqual({ min: 0, max: 90 });
    expect(exit.entry.alignment).toEqual({ min: 0, max: 1 });
  });
});

describe('the 1-3 shaft (the reported case)', () => {
  const level = parseLevel(JSON.parse(readFileSync(join(root, '1-3.json'), 'utf8')));
  const exit = level.exit;
  it.each([1, 5, 12, 20, 28, 40])('accepts a drop into the opening at %s m/s', (speed) => {
    if (!exit || !('entry' in exit)) throw new Error('1-3 needs an entry exit');
    const x = (exit.min.x + exit.max.x) / 2;
    for (const vx of [-4, 0, 6]) {
      const attempt = evaluateExitEntry(
        exit,
        { x, y: exit.min.y - 0.5 },
        { x: x + vx / 60, y: exit.min.y + 0.5 },
        { x: vx, y: speed },
        0.35,
      );
      expect(attempt?.accepted, `vx ${String(vx)}: ${String(attempt?.reason)}`).toBe(true);
    }
  });
});
