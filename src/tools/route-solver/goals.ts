import type { Vec2 } from '../../core';
import type { LevelDef, SimEvent } from '../../sim';
import type { World } from './world';

type Region = { readonly min: Vec2; readonly max: Vec2 };

/** What finishing a chamber means. */
export type ChamberGoal =
  /** The level exit accepts the entry (typed compartment) or is entered (legacy box). */
  | { readonly kind: 'exit' }
  /** The player centre is inside the region. */
  | { readonly kind: 'region'; readonly min: Vec2; readonly max: Vec2 }
  /** Checkpoint `index` (or a later one) has activated. */
  | { readonly kind: 'checkpoint'; readonly index: number; readonly id: string }
  /** The player centre is within `radius` of `at`. */
  | { readonly kind: 'point'; readonly at: Vec2; readonly radius: number };

/** One unit of solving: a chamber from the level data or the whole level when it has none. */
export interface ChamberSpec {
  readonly id: string;
  readonly goal: ChamberGoal;
  /** Area the distance field steers toward. */
  readonly target: Region;
}

/** Checkpoint trigger half-extents (Simulation.updateCheckpoints). */
const CP_HALF_W = 0.75;
const CP_HALF_H = 1.5;

/**
 * Chambers in order with their goals. The last chamber ends at the exit when the level has one.
 * An earlier chamber ends at the first checkpoint inside the next chamber, or else on entering
 * the next chamber's region. A level with no chambers is one chamber, "level", ending at the exit.
 */
export function chamberSpecs(level: LevelDef): ChamberSpec[] {
  const exitRegion: Region | null = level.exit
    ? { min: level.exit.min, max: level.exit.max }
    : null;
  const chambers = level.chambers ?? [];
  if (chambers.length === 0) {
    return exitRegion ? [{ id: 'level', goal: { kind: 'exit' }, target: exitRegion }] : [];
  }
  return chambers.map((chamber, i) => {
    const next = chambers[i + 1];
    if (!next) {
      if (exitRegion) return { id: chamber.id, goal: { kind: 'exit' }, target: exitRegion };
      return {
        id: chamber.id,
        goal: { kind: 'region', ...chamber.region },
        target: chamber.region,
      };
    }
    const cps = level.checkpoints ?? [];
    const index = cps.findIndex((cp) => inside(cp.position, next.region));
    const cp = cps[index];
    if (cp) {
      const target = {
        min: { x: cp.position.x - CP_HALF_W, y: cp.position.y - CP_HALF_H },
        max: { x: cp.position.x + CP_HALF_W, y: cp.position.y + CP_HALF_H },
      };
      return { id: chamber.id, goal: { kind: 'checkpoint', index, id: cp.id }, target };
    }
    return {
      id: chamber.id,
      goal: { kind: 'region', ...next.region },
      target: next.region,
    };
  });
}

/** Checked after every tick with that tick's events. */
export function goalReached(goal: ChamberGoal, world: World, events: readonly SimEvent[]): boolean {
  switch (goal.kind) {
    case 'exit':
      return events.some((e) => e.type === 'exit');
    case 'checkpoint':
      return events.some((e) => e.type === 'checkpoint' && e.index >= goal.index);
    case 'region':
      return inside(world.body().position, goal);
    case 'point': {
      const p = world.body().position;
      return (p.x - goal.at.x) ** 2 + (p.y - goal.at.y) ** 2 <= goal.radius ** 2;
    }
  }
}

export function inside(p: Vec2, r: Region): boolean {
  return p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;
}

/**
 * Search heuristic: free-space path distance (m) to the goal area on a coarse grid that ignores
 * physics (it can "fly"). Only orders the search; it never decides success.
 */
export class DistanceField {
  private readonly dist: Float64Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly x0: number;
  private readonly y0: number;

  constructor(
    level: LevelDef,
    target: Region,
    private readonly cell = 0.5,
  ) {
    const { minX, minY, maxX, maxY } = level.bounds;
    this.x0 = minX;
    this.y0 = minY;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.rows = Math.max(1, Math.ceil((maxY - minY) / cell));
    const n = this.cols * this.rows;
    const blocked = new Uint8Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.centre(c, r);
        if (level.solids.some((s) => pointInPolygon(p, s.points))) blocked[r * this.cols + c] = 1;
      }
    }
    this.dist = new Float64Array(n).fill(Infinity);
    // Dijkstra on an 8-connected grid; n is small (a few thousand cells), so a plain O(n²) scan
    // would do, but a binary heap keeps long levels fast.
    const heap: [number, number][] = [];
    const push = (d: number, i: number) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if ((heap[parent] as [number, number])[0] <= d) break;
        [heap[k], heap[parent]] = [heap[parent] as [number, number], heap[k] as [number, number]];
        k = parent;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0] as [number, number];
      const last = heap.pop() as [number, number];
      if (heap.length > 0) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (
            l < heap.length &&
            (heap[l] as [number, number])[0] < (heap[m] as [number, number])[0]
          )
            m = l;
          if (
            r < heap.length &&
            (heap[r] as [number, number])[0] < (heap[m] as [number, number])[0]
          )
            m = r;
          if (m === k) break;
          [heap[k], heap[m]] = [heap[m] as [number, number], heap[k] as [number, number]];
          k = m;
        }
      }
      return top;
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (!blocked[i] && inside(this.centre(c, r), grow(target, cell / 2))) {
          this.dist[i] = 0;
          push(0, i);
        }
      }
    }
    const steps = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;
    while (heap.length > 0) {
      const [d, i] = pop();
      if (d > (this.dist[i] as number)) continue;
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      for (const [dc, dr, w] of steps) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const j = nr * this.cols + nc;
        if (blocked[j]) continue;
        const nd = d + w * cell;
        if (nd < (this.dist[j] as number)) {
          this.dist[j] = nd;
          push(nd, j);
        }
      }
    }
  }

  /** Distance estimate (m) from a point; Infinity where the goal is unreachable even flying. */
  at(p: Vec2): number {
    const c0 = Math.floor((p.x - this.x0) / this.cell);
    const r0 = Math.floor((p.y - this.y0) / this.cell);
    let best = Infinity;
    // The player centre can sit in a cell whose centre is inside a solid: use the best neighbour.
    for (let ring = 0; ring <= 2 && best === Infinity; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const d = this.dist[r * this.cols + c] as number;
          if (d < Infinity) best = Math.min(best, d + ring * this.cell);
        }
      }
    }
    return best;
  }

  private centre(c: number, r: number): Vec2 {
    return { x: this.x0 + (c + 0.5) * this.cell, y: this.y0 + (r + 0.5) * this.cell };
  }
}

function grow(r: Region, by: number): Region {
  return {
    min: { x: r.min.x - by, y: r.min.y - by },
    max: { x: r.max.x + by, y: r.max.y + by },
  };
}

function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let insideFlag = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      insideFlag = !insideFlag;
    }
  }
  return insideFlag;
}
