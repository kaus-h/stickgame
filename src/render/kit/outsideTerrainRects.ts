export interface ProjectedTerrainBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface HorizontalInterval {
  readonly left: number;
  readonly right: number;
}

export interface OutsideTerrainRect extends HorizontalInterval {
  readonly top: number;
  readonly bottom: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Merge horizontal spans without mutating their input. */
function mergeIntervals(
  intervals: readonly HorizontalInterval[],
  min: number,
  max: number,
): HorizontalInterval[] {
  const sorted = intervals
    .map(({ left, right }) => ({ left: Math.max(min, left), right: Math.min(max, right) }))
    .filter(({ left, right }) => right > left)
    .sort((a, b) => a.left - b.left || a.right - b.right);
  const merged: HorizontalInterval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval.left <= previous.right) {
      merged[merged.length - 1] = {
        left: previous.left,
        right: Math.max(previous.right, interval.right),
      };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/**
 * Return disjoint viewport rectangles outside the projected level bounds. The top side is
 * intentionally limited to authored solid columns that touch the level's upper bound.
 */
export function outsideTerrainRects(
  bounds: ProjectedTerrainBounds,
  viewport: { readonly width: number; readonly height: number },
  topColumns: readonly HorizontalInterval[] = [],
): OutsideTerrainRect[] {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  if (width === 0 || height === 0) return [];

  const left = clamp(bounds.left, 0, width);
  const right = clamp(bounds.right, 0, width);
  const top = clamp(bounds.top, 0, height);
  const bottom = clamp(bounds.bottom, 0, height);
  const rects: OutsideTerrainRect[] = [];
  const add = (x0: number, y0: number, x1: number, y1: number): void => {
    if (x1 > x0 && y1 > y0) rects.push({ left: x0, top: y0, right: x1, bottom: y1 });
  };

  // Bottom extends across the whole viewport. Side strips cover the full visible height
  // up to it; top-column fills stay horizontally inside the level to remain disjoint.
  add(0, bottom, width, height);
  add(0, 0, left, bottom);
  add(right, 0, width, bottom);

  // Only top-bound solid columns continue above the authored page. Keep them inside the
  // projected left/right bounds so their corners don't double-cover the side strips.
  for (const interval of mergeIntervals(topColumns, left, right)) {
    add(interval.left, 0, interval.right, top);
  }

  return rects;
}
