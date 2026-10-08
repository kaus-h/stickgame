import type { RuntimeTuning } from '../../content';
import type { LevelDef } from '../../sim';
import { DistanceField, goalReached, inside, type ChamberSpec } from './goals';
import { PlanSource, type PlanStep } from './plan';
import { runPlan, type World } from './world';

/** Search knobs. Budgets are in simulated ticks, never wall time, so results are deterministic. */
export interface SearchOptions {
  /** Ticks a decision is held before the next one may be taken (coarse timing grid). */
  readonly waits: readonly number[];
  /** Jump hold lengths in ticks: a short hop and a full jump. */
  readonly jumpHolds: readonly number[];
  /** Impact offsets tried on each anchor disc (indices into ROPE_OFFSETS). */
  readonly offsets: readonly number[];
  /** Simulated ticks the search may spend on one chamber before giving up. */
  readonly maxSimTicks: number;
  /** Longest route considered for one chamber, ticks. */
  readonly maxChamberTicks: number;
  /** Greedy weight on the distance heuristic (1 = A*-like, larger = greedier). */
  readonly heuristicWeight: number;
  /**
   * Expansions allowed per 0.5 m cell of player position (per 0.5 s with moving anchors). Stops
   * the search flooding one dead end (hanging on a rope over a pit stays alive forever).
   */
  readonly expansionsPerCell: number;
  /** Cost in ticks added per jump/rope/release input: prefers routes with fewer inputs. */
  readonly inputCost: number;
}

export const DEFAULT_SEARCH: SearchOptions = {
  waits: [4, 8, 12, 16, 24, 32, 48],
  jumpHolds: [4, 25],
  offsets: [0, 1, 2, 3, 4],
  maxSimTicks: 6_000_000,
  maxChamberTicks: 2_400,
  heuristicWeight: 2,
  expansionsPerCell: 16,
  inputCost: 8,
};

export interface SearchResult {
  readonly solved: boolean;
  /** Full plan (earlier chambers' steps included) when solved. */
  readonly steps: readonly PlanStep[];
  /** Tick (exclusive) on which the goal was reached. */
  readonly endTick: number;
  readonly expansions: number;
  readonly simTicks: number;
  /** Deaths met while searching (pruned branches). */
  readonly deaths: number;
  /** Closest approach to the goal area (m, heuristic distance), for unsolved reports. */
  readonly closest: { readonly distance: number; readonly x: number; readonly y: number };
}

interface Node {
  world: World | null;
  readonly parent: Node | null;
  readonly steps: readonly PlanStep[];
  readonly tick: number;
  readonly axis: -1 | 0 | 1;
  /** Accumulated input cost (ticks). */
  readonly cost: number;
  /** Coarse position (and time) cell, for the per-cell expansion cap. */
  readonly cell: string;
  readonly f: number;
  readonly seq: number;
}

type Verb =
  | { readonly kind: 'none' }
  | { readonly kind: 'jump'; readonly hold: number }
  | { readonly kind: 'rope'; readonly anchor: number; readonly offset: number }
  | { readonly kind: 'release' };

const TICKS_PER_METER = 8; // run speed 7.5 m/s
/** Heuristic penalty (m) for standing in an exit that already rejected this attempt's entry. */
const REJECTED_EXIT_PENALTY = 10;

/**
 * Best-first search over coarse input decisions. A node is a simulation state; its children set
 * the move axis and optionally press jump, press rope (anchor × impact offset) or release the
 * rope, then hold that for one of `waits` ticks. Children are ordered by elapsed ticks plus the
 * weighted free-space distance to the goal, deduplicated on a quantised state key, and stored
 * lazily (re-simulated from their parent when expanded). Branches that die are pruned.
 */
export function searchChamber(
  start: World,
  baseSteps: readonly PlanStep[],
  spec: ChamberSpec,
  level: LevelDef,
  tuning: RuntimeTuning,
  opts: SearchOptions,
): SearchResult {
  const field = new DistanceField(level, spec.target);
  const startTick = start.tick;
  const deadline = startTick + opts.maxChamberTicks;
  const maxWait = Math.max(...opts.waits);
  const waits = new Set(opts.waits);
  const moving = level.anchors.some((a) => a.path);
  const rope = tuning.sim.rope;
  const typedExit = level.exit && 'entry' in level.exit ? level.exit : null;

  let simTicks = 0;
  let deaths = 0;
  let expansions = 0;
  let seq = 0;
  let closest = { distance: Infinity, x: 0, y: 0 };
  const heap: Node[] = [];
  const visited = new Map<string, number>();

  const less = (a: Node, b: Node) => a.f < b.f || (a.f === b.f && a.seq < b.seq);
  const push = (n: Node) => {
    heap.push(n);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(n, heap[p] as Node)) break;
      heap[k] = heap[p] as Node;
      k = p;
    }
    heap[k] = n;
  };
  const pop = (): Node => {
    const top = heap[0] as Node;
    const last = heap.pop() as Node;
    if (heap.length > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = last;
        let mi = -1;
        if (l < heap.length && less(heap[l] as Node, m)) {
          m = heap[l] as Node;
          mi = l;
        }
        if (r < heap.length && less(heap[r] as Node, m)) {
          m = heap[r] as Node;
          mi = r;
        }
        if (mi < 0) break;
        heap[k] = m;
        k = mi;
      }
      heap[k] = last;
    }
    return top;
  };

  const heuristic = (w: World): number => {
    const p = w.body().position;
    let h = field.at(p);
    if (typedExit && inside(p, typedExit)) {
      const last = Reflect.get(w.sim, 'lastExitAttempt') as { accepted: boolean } | null;
      if (last && !last.accepted) h += REJECTED_EXIT_PENALTY;
    }
    return h;
  };

  const stateKey = (w: World, axis: number, steps: readonly PlanStep[]): string => {
    const b = w.body();
    const r = Reflect.get(w.sim, 'rope') as {
      anchor: number;
      length: number;
      locked: boolean;
    } | null;
    const q = (v: number, s: number) => Math.round(v / s);
    const jumpHeld = steps.some((s) => s.action === 'jump' && s.t + s.hold >= w.tick);
    return [
      q(b.position.x, 0.2),
      q(b.position.y, 0.2),
      q(b.velocity.x, 0.75),
      q(b.velocity.y, 0.75),
      b.grounded ? 1 : 0,
      r ? `${String(r.anchor)}:${String(q(r.length, 0.4))}:${r.locked ? 'L' : 'U'}` : '-',
      axis,
      jumpHeld ? 1 : 0,
      moving ? Math.floor(w.tick / 6) : 0,
    ].join(',');
  };

  const cellOf = (w: World): string => {
    const p = w.body().position;
    const t = moving ? Math.floor(w.tick / 30) : 0;
    return `${String(Math.floor(p.x / 0.5))},${String(Math.floor(p.y / 0.5))},${String(t)}`;
  };

  const initialAxis = (): -1 | 0 | 1 => {
    let axis: -1 | 0 | 1 = 0;
    let at = -1;
    for (const s of baseSteps)
      if (s.action === 'move' && s.t < startTick && s.t >= at) {
        axis = s.axis;
        at = s.t;
      }
    return axis;
  };

  const materialize = (n: Node): World => {
    if (n.world) return n.world;
    const parent = n.parent as Node;
    const w = (parent.world as World).fork();
    const r = runPlan(w, new PlanSource(n.steps, level), n.tick, () => false);
    simTicks += n.tick - parent.tick;
    if (r.died) throw new Error('route-solver: lazy child diverged from its first simulation');
    n.world = w;
    return w;
  };

  push({
    world: start.fork(),
    parent: null,
    steps: baseSteps,
    tick: startTick,
    axis: initialAxis(),
    cost: 0,
    cell: cellOf(start),
    f: 0,
    seq: seq++,
  });

  const cellCount = new Map<string, number>();
  while (heap.length > 0 && simTicks < opts.maxSimTicks) {
    const node = pop();
    const count = cellCount.get(node.cell) ?? 0;
    if (count >= opts.expansionsPerCell) continue;
    cellCount.set(node.cell, count + 1);
    const world = materialize(node);
    expansions++;
    const body = world.body();
    const openRope = Reflect.get(world.sim, 'rope') !== null;
    const jumpPending = node.steps.some((s) => s.action === 'jump' && s.t + s.hold >= node.tick);

    const verbs: Verb[] = [{ kind: 'none' }];
    if (body.grounded && !jumpPending)
      for (const hold of opts.jumpHolds) verbs.push({ kind: 'jump', hold });
    if (openRope) verbs.push({ kind: 'release' });
    else {
      const anchors = world.sim.snapshot().anchors;
      level.anchors.forEach((a, i) => {
        const at = anchors[i] ?? a.position;
        const d = Math.sqrt((at.x - body.position.x) ** 2 + (at.y - body.position.y) ** 2);
        if (d < rope.minLength - a.radius || d > rope.maxLength + a.radius) return;
        for (const offset of opts.offsets) verbs.push({ kind: 'rope', anchor: i, offset });
      });
    }

    for (const axis of [1, -1, 0] as const) {
      for (const verb of verbs) {
        const steps = node.steps.slice();
        if (axis !== node.axis) steps.push({ t: node.tick, action: 'move', axis });
        if (verb.kind === 'jump') steps.push({ t: node.tick, action: 'jump', hold: verb.hold });
        else if (verb.kind === 'rope')
          steps.push({
            t: node.tick,
            action: 'rope',
            anchor: verb.anchor,
            offset: verb.offset,
            release: null,
          });
        else if (verb.kind === 'release') {
          const i = steps.findIndex((s) => s.action === 'rope' && s.release === null);
          const open = steps[i];
          if (open?.action !== 'rope') continue;
          steps[i] = { ...open, release: node.tick };
        }
        const w = world.fork();
        const source = new PlanSource(steps, level);
        for (let k = 1; k <= maxWait && w.tick < deadline; k++) {
          const events = w.step(source);
          simTicks++;
          if (events.some((e) => e.type === 'death')) {
            deaths++;
            break;
          }
          if (verb.kind === 'rope' && k === 1 && !events.some((e) => e.type === 'ropeAttach'))
            break; // invalid press (blocked, too far, too close): nothing to explore
          if (goalReached(spec.goal, w, events)) {
            return { solved: true, steps, endTick: w.tick, expansions, simTicks, deaths, closest };
          }
          if (!waits.has(k)) continue;
          const h = heuristic(w);
          if (h === Infinity) break;
          if (h < closest.distance) {
            const p = w.body().position;
            closest = { distance: h, x: p.x, y: p.y };
          }
          const key = stateKey(w, axis, steps);
          const cost = node.cost + (verb.kind === 'none' ? 0 : opts.inputCost);
          const g = w.tick - startTick + cost;
          const seen = visited.get(key);
          if (seen !== undefined && seen <= g) continue;
          visited.set(key, g);
          push({
            world: null,
            parent: node,
            steps,
            tick: w.tick,
            axis,
            cost,
            cell: cellOf(w),
            f: g + opts.heuristicWeight * TICKS_PER_METER * h,
            seq: seq++,
          });
        }
      }
    }
  }
  return {
    solved: false,
    steps: baseSteps,
    endTick: startTick,
    expansions,
    simTicks,
    deaths,
    closest,
  };
}
