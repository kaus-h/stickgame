import { describe, expect, it } from 'vitest';
import {
  outsideTerrainRects,
  type OutsideTerrainRect,
} from '../../src/render/kit/outsideTerrainRects';

const overlaps = (a: OutsideTerrainRect, b: OutsideTerrainRect): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

describe('outside terrain rectangles', () => {
  it('extends the lower border through the visible viewport in overview', () => {
    const rects = outsideTerrainRects(
      { left: 30, top: 15, right: 170, bottom: 62 },
      { width: 200, height: 120 },
    );

    expect(rects).toContainEqual({ left: 0, top: 62, right: 200, bottom: 120 });
  });

  it('clamps and merges top columns while keeping side and corner rectangles disjoint', () => {
    const rects = outsideTerrainRects(
      { left: 20, top: 25, right: 80, bottom: 75 },
      { width: 100, height: 100 },
      [
        { left: 5, right: 35 },
        { left: 30, right: 45 },
        { left: 70, right: 95 },
      ],
    );

    expect(rects).toContainEqual({ left: 20, top: 0, right: 45, bottom: 25 });
    expect(rects).toContainEqual({ left: 70, top: 0, right: 80, bottom: 25 });
    expect(rects).toContainEqual({ left: 0, top: 0, right: 20, bottom: 75 });
    expect(rects).toContainEqual({ left: 80, top: 0, right: 100, bottom: 75 });
    expect(
      rects.every(
        (rect) => rect.left >= 0 && rect.top >= 0 && rect.right <= 100 && rect.bottom <= 100,
      ),
    ).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const first = rects[i];
        const second = rects[j];
        if (first && second) expect(overlaps(first, second)).toBe(false);
      }
    }
  });

  it('fills the viewport when the level bounds are completely above it', () => {
    expect(
      outsideTerrainRects(
        { left: 20, top: -50, right: 80, bottom: -10 },
        { width: 100, height: 100 },
      ),
    ).toEqual([{ left: 0, top: 0, right: 100, bottom: 100 }]);
  });

  it('extends only top-bound solid columns when the bounds are below the viewport', () => {
    expect(
      outsideTerrainRects(
        { left: 20, top: 120, right: 80, bottom: 160 },
        { width: 100, height: 100 },
        [
          { left: 25, right: 40 },
          { left: 60, right: 85 },
        ],
      ),
    ).toEqual([
      { left: 0, top: 0, right: 20, bottom: 100 },
      { left: 80, top: 0, right: 100, bottom: 100 },
      { left: 25, top: 0, right: 40, bottom: 100 },
      { left: 60, top: 0, right: 80, bottom: 100 },
    ]);
  });

  it('returns no rectangles for a viewport entirely within level bounds or an empty viewport', () => {
    expect(
      outsideTerrainRects(
        { left: -100, top: -100, right: 200, bottom: 200 },
        { width: 100, height: 80 },
      ),
    ).toEqual([]);
    expect(
      outsideTerrainRects({ left: 0, top: 0, right: 20, bottom: 20 }, { width: 0, height: 80 }),
    ).toEqual([]);
  });
});
