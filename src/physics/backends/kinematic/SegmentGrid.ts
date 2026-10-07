import type { Segment } from '../../adapter';

/**
 * Uniform-grid broadphase for static segments. Queries return candidate indices in ascending
 * order, so the solver visits segments in the same order as a brute-force scan and results stay
 * bit-identical.
 */
export class SegmentGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly stamp: Uint32Array;
  private query = 0;
  private readonly out: number[] = [];

  constructor(
    segments: readonly Segment[],
    private readonly cellSize = 2,
  ) {
    this.stamp = new Uint32Array(segments.length);
    segments.forEach((s, i) => {
      const [x0, y0, x1, y1] = [
        Math.min(s.a.x, s.b.x),
        Math.min(s.a.y, s.b.y),
        Math.max(s.a.x, s.b.x),
        Math.max(s.a.y, s.b.y),
      ];
      this.forCells(x0, y0, x1, y1, (key) => {
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(i);
      });
    });
  }

  /** Segment indices whose cells overlap the box, ascending, deduplicated. Reused array: copy if kept. */
  candidates(x0: number, y0: number, x1: number, y1: number): readonly number[] {
    this.query = (this.query + 1) >>> 0;
    if (this.query === 0) {
      this.stamp.fill(0);
      this.query = 1;
    }
    const out = this.out;
    out.length = 0;
    this.forCells(x0, y0, x1, y1, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      for (const i of list) {
        if (this.stamp[i] !== this.query) {
          this.stamp[i] = this.query;
          out.push(i);
        }
      }
    });
    out.sort((a, b) => a - b);
    return out;
  }

  private forCells(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fn: (key: number) => void,
  ): void {
    const cx0 = Math.floor(x0 / this.cellSize);
    const cy0 = Math.floor(y0 / this.cellSize);
    const cx1 = Math.floor(x1 / this.cellSize);
    const cy1 = Math.floor(y1 / this.cellSize);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) fn((cx + 32768) * 65536 + (cy + 32768));
    }
  }
}
