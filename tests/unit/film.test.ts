import { describe, expect, it } from 'vitest';
import { sheetPicks } from '../../src/tools/film/capture';

describe('film contact sheet (GMR-115)', () => {
  it('spreads picks evenly and keeps the first and last frame', () => {
    expect(sheetPicks(251, 16)).toHaveLength(16);
    expect(sheetPicks(251, 16)[0]).toBe(0);
    expect(sheetPicks(251, 16).at(-1)).toBe(250);
    const picks = sheetPicks(100, 5);
    expect(picks).toEqual([0, 25, 50, 74, 99]);
  });

  it('never picks more frames than were filmed', () => {
    expect(sheetPicks(3, 16)).toEqual([0, 1, 2]);
    expect(sheetPicks(1, 16)).toEqual([0]);
    expect(sheetPicks(0, 16)).toEqual([]);
  });
});
