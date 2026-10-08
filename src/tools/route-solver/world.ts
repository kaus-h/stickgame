import type { Intent, Vec2 } from '../../core';
import type { RuntimeTuning } from '../../content';
import type { BodyState, PhysicsAdapter, Segment } from '../../physics';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { SegmentGrid } from '../../physics/backends/kinematic/SegmentGrid';
import {
  levelSegments,
  Simulation,
  type LevelDef,
  type SimEvent,
  type SimSnapshot,
} from '../../sim';

/**
 * Routes may not pass closer than this to a hazard (m). The simulation counts a hazard within
 * its 1 cm ground probe as standing ground without a contact, so a route could jump off a lethal
 * floor it never touches; the solver treats such grazes as deaths instead of exploiting them.
 */
export const HAZARD_MARGIN = 0.02;

/** Supplies a tick's intents; `before` builds the snapshot just before the tick (on demand). */
export interface TickSource {
  intents(tick: number, before: () => SimSnapshot): readonly Intent[];
}

/**
 * A headless simulation the solver can fork. The real Simulation and KinematicPhysicsAdapter run
 * unchanged; forking deep-copies their mutable state (search only). Every route the solver
 * reports is re-run from a fresh simulation at tick 0, so a fork never decides a result alone.
 */
export class World {
  private tickCount: number;

  private constructor(
    readonly sim: Simulation,
    private readonly shared: ReadonlySet<object>,
    tick: number,
    private readonly hazards: readonly Segment[],
    private readonly radius: number,
  ) {
    this.tickCount = tick;
  }

  static create(level: LevelDef, tuning: RuntimeTuning): World {
    const physics = new KinematicPhysicsAdapter();
    const sim = new Simulation(tuning.sim, physics, level);
    // Immutable for the whole run: shared between forks instead of copied.
    const shared = new Set<object>([level, tuning, tuning.sim]);
    const segments: unknown = Reflect.get(physics, 'segments');
    if (Array.isArray(segments)) shared.add(segments);
    const hazards = levelSegments(level).filter((seg) => seg.kind === 'hazard');
    return new World(sim, shared, 0, hazards, tuning.sim.player.radius);
  }

  fork(): World {
    return new World(
      deepClone(this.sim, this.shared),
      this.shared,
      this.tickCount,
      this.hazards,
      this.radius,
    );
  }

  /** True if the player is within HAZARD_MARGIN of a hazard surface (see HAZARD_MARGIN). */
  grazesHazard(): boolean {
    const p = this.body().position;
    const reach = this.radius + HAZARD_MARGIN;
    for (const seg of this.hazards) {
      const ex = seg.b.x - seg.a.x;
      const ey = seg.b.y - seg.a.y;
      const len2 = ex * ex + ey * ey;
      const u =
        len2 > 0
          ? Math.max(0, Math.min(1, ((p.x - seg.a.x) * ex + (p.y - seg.a.y) * ey) / len2))
          : 0;
      const dx = p.x - (seg.a.x + ex * u);
      const dy = p.y - (seg.a.y + ey * u);
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
    return false;
  }

  /** Simulation tick the next step will run (tick 0 = level start). */
  get tick(): number {
    return this.tickCount;
  }

  step(source: TickSource): SimEvent[] {
    const sim = this.sim;
    sim.step(source.intents(this.tickCount, () => sim.snapshot()));
    this.tickCount++;
    return sim.drainEvents();
  }

  /** Player body state, read without building a full snapshot (snapshots raycast the aim). */
  body(): BodyState {
    return this.physics().bodyState(Reflect.get(this.sim, 'body') as number);
  }

  /** Development start: put the player at rest at a point (single-chamber solving only). */
  teleport(position: Vec2): void {
    this.physics().teleportBody(Reflect.get(this.sim, 'body') as number, position);
  }

  private physics(): PhysicsAdapter {
    return Reflect.get(this.sim, 'physics') as PhysicsAdapter;
  }
}

/** Outcome of stepping a world through a plan. */
export interface RunResult {
  /** Tick (exclusive end) the run stopped at. */
  readonly tick: number;
  readonly died: boolean;
  /** True if `stop` returned true. */
  readonly stopped: boolean;
}

/**
 * Step `world` with `source` from its current tick up to `until` (exclusive). `stop` sees the
 * events of every tick after it is stepped; returning true ends the run there. A death or a
 * hazard graze (HAZARD_MARGIN) ends it as a death.
 */
export function runPlan(
  world: World,
  source: TickSource,
  until: number,
  stop: (world: World, events: readonly SimEvent[]) => boolean,
): RunResult {
  while (world.tick < until) {
    const events = world.step(source);
    if (events.some((e) => e.type === 'death') || world.grazesHazard())
      return { tick: world.tick, died: true, stopped: false };
    if (stop(world, events)) return { tick: world.tick, died: false, stopped: true };
  }
  return { tick: world.tick, died: false, stopped: false };
}

/**
 * Structural deep copy that keeps prototypes (class instances stay class instances) and aliasing.
 * Objects in `shared`, frozen objects and the static broadphase grid are shared, not copied.
 */
export function deepClone<T>(root: T, shared: ReadonlySet<object>): T {
  const memo = new Map<object, unknown>();
  const visit = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) return value;
    if (shared.has(value) || Object.isFrozen(value) || value instanceof SegmentGrid) return value;
    const seen = memo.get(value);
    if (seen !== undefined) return seen;
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      memo.set(value, out);
      for (const item of value as unknown[]) out.push(visit(item));
      return out;
    }
    if (value instanceof Map) {
      const out = new Map<unknown, unknown>();
      memo.set(value, out);
      for (const [k, v] of value as Map<unknown, unknown>) out.set(visit(k), visit(v));
      return out;
    }
    if (value instanceof Set) {
      const out = new Set<unknown>();
      memo.set(value, out);
      for (const v of value as Set<unknown>) out.add(visit(v));
      return out;
    }
    if (ArrayBuffer.isView(value)) {
      const out = (value as unknown as Uint8Array).slice();
      memo.set(value, out);
      return out;
    }
    const out = Object.create(Object.getPrototypeOf(value) as object | null) as Record<
      PropertyKey,
      unknown
    >;
    memo.set(value, out);
    for (const key of Reflect.ownKeys(value)) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d) continue;
      if ('value' in d) d.value = visit(d.value);
      Object.defineProperty(out, key, d);
    }
    return out;
  };
  return visit(root) as T;
}
