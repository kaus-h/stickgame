import { describe, expect, it } from 'vitest';
import { layoutGrid, selectFrameTicks, selectSheetFrames } from '../../scripts/film-math.mjs';

describe('film frame selection', () => {
  it('captures at tick intervals and preserves an off-interval route ending', () => {
    expect(selectFrameTicks(10, 23, 4)).toEqual([10, 14, 18, 22, 23]);
    expect(selectFrameTicks(0, 12)).toEqual([0, 4, 8, 12]);
    expect(selectFrameTicks(7, 7)).toEqual([7]);
  });

  it('thins evenly while retaining the beginning and completion', () => {
    expect(selectFrameTicks(0, 40, 4, 4)).toEqual([0, 12, 28, 40]);
    expect(selectFrameTicks(0, 1_000_000_000, 1, 3)).toEqual([0, 500_000_000, 1_000_000_000]);
    expect(selectFrameTicks(3, 20, 4, 2)).toEqual([3, 20]);
  });

  it('selects sixteen distributed sheet frames with both endpoints', () => {
    const captured = selectFrameTicks(0, 240);
    const sheet = selectSheetFrames(captured);
    expect(sheet).toHaveLength(16);
    expect(sheet[0]).toBe(0);
    expect(sheet.at(-1)).toBe(240);
    expect(sheet.every((tick, index) => index === 0 || tick > (sheet[index - 1] ?? -1))).toBe(true);
    expect(selectSheetFrames([3, 8, 13, 18, 23], 3)).toEqual([3, 13, 23]);
    expect(selectSheetFrames([0, 4])).toEqual([0, 4]);
    expect(selectSheetFrames([])).toEqual([]);
  });

  it('rejects invalid capture or sheet parameters', () => {
    for (const args of [
      [-1, 10, 4],
      [0, 10.5, 4],
      [10, 0, 4],
      [0, 10, 0],
      [0, 10, 4, 1],
      [0, Infinity, 4],
    ]) {
      expect(() => selectFrameTicks(args[0] ?? 0, args[1] ?? 0, args[2], args[3])).toThrow(
        RangeError,
      );
    }
    expect(() => selectSheetFrames([0, 0])).toThrow('strictly increasing');
    expect(() => selectSheetFrames([4, 0])).toThrow('strictly increasing');
    expect(() => selectSheetFrames([0, 2.5])).toThrow(RangeError);
    expect(() => selectSheetFrames([0, 4], 1)).toThrow(RangeError);
  });
});

describe('film contact-sheet layout', () => {
  it('fits sixteen frames in four columns within 1600px without shrinking labels', () => {
    const grid = layoutGrid(16, 960, 540);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(4);
    expect(grid.width).toBeLessThanOrEqual(1600);
    expect(grid.labelHeight).toBeGreaterThanOrEqual(28);
    expect(grid.frameWidth / grid.frameHeight).toBeCloseTo(960 / 540, 2);
    expect(grid.cells).toHaveLength(16);
    for (const cell of grid.cells) {
      expect(cell.x + grid.frameWidth).toBeLessThanOrEqual(grid.width - grid.padding);
      expect(cell.labelY).toBe(cell.y + grid.frameHeight);
      expect(cell.labelY + grid.labelHeight).toBeLessThanOrEqual(grid.height - grid.padding);
    }
  });

  it('avoids upscaling and accounts for partial final rows and label gutters', () => {
    const grid = layoutGrid(13, 200, 100);
    expect(grid.frameWidth).toBe(200);
    expect(grid.frameHeight).toBe(100);
    expect(grid.width).toBe(868);
    expect(grid.height).toBe(596);
    expect(grid.cells[4]).toEqual({ x: 16, y: 160, labelY: 260 });
    expect(grid.cells[12]).toEqual({ x: 16, y: 448, labelY: 548 });
    expect(layoutGrid(1, 200, 100).width).toBe(232);
  });

  it('rejects zero dimensions and impossible width limits', () => {
    expect(() => layoutGrid(0, 200, 100)).toThrow(RangeError);
    expect(() => layoutGrid(16, 0, 100)).toThrow(RangeError);
    expect(() => layoutGrid(16, 200, 1.5)).toThrow(RangeError);
    expect(() => layoutGrid(16, 200, 100, 30)).toThrow('too small');
  });
});
