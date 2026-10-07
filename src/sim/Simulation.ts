import { SIM_DT, vec2, type Intent, type Vec2 } from '../core';
import type { PhysicsAdapter, PhysicsStats } from '../physics';
import type { SimTuning } from './tuning';

export interface ProbeState {
  readonly position: Vec2;
  readonly velocity: Vec2;
}

/** Immutable view of the simulation after a step; render interpolates between two of these. */
export interface SimSnapshot {
  /** Monotonic tick since the simulation was created. */
  readonly tick: number;
  /** Tick within the current attempt; returns to 0 on reset. */
  readonly attemptTick: number;
  readonly resets: number;
  readonly probe: ProbeState;
}

export type SimEvent =
  | { readonly type: 'reset'; readonly tick: number }
  | { readonly type: 'probeBounce'; readonly tick: number; readonly surface: 'floor' | 'wall' };

export interface SimStats {
  readonly tick: number;
  readonly attemptTick: number;
  readonly resets: number;
  /** Live simulation entities; must stay constant across resets. */
  readonly entities: number;
  readonly pendingEvents: number;
  readonly physics: PhysicsStats;
}

/**
 * The canonical simulation. Advances only in fixed SIM_DT steps and only from intents, so the
 * same intents produce the same states regardless of frame rate or platform.
 */
export class Simulation {
  private tickCount = 0;
  private attemptTicks = 0;
  private resetCount = 0;
  private probe: ProbeState;
  private events: SimEvent[] = [];

  constructor(
    private readonly tuning: SimTuning,
    private readonly physics: PhysicsAdapter,
  ) {
    this.probe = this.initialProbe();
  }

  step(intents: readonly Intent[]): void {
    if (intents.some((i) => i.type === 'restart')) this.reset();

    this.stepProbe();
    this.physics.step(SIM_DT, this.tuning.physicsSubsteps);
    this.tickCount++;
    this.attemptTicks++;
  }

  /** Back to the authored initial state inside the same physics world. */
  reset(): void {
    this.physics.resetBodies();
    this.probe = this.initialProbe();
    this.attemptTicks = 0;
    this.resetCount++;
    this.events.push({ type: 'reset', tick: this.tickCount });
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.tickCount,
      attemptTick: this.attemptTicks,
      resets: this.resetCount,
      probe: this.probe,
    };
  }

  drainEvents(): SimEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  stats(): SimStats {
    return {
      tick: this.tickCount,
      attemptTick: this.attemptTicks,
      resets: this.resetCount,
      entities: 1,
      pendingEvents: this.events.length,
      physics: this.physics.stats(),
    };
  }

  dispose(): void {
    this.physics.dispose();
    this.events = [];
  }

  private initialProbe(): ProbeState {
    return { position: this.tuning.probe.start, velocity: this.tuning.probe.velocity };
  }

  /** Semi-implicit Euler with bounces; a stand-in body that makes timing behaviour visible. */
  private stepProbe(): void {
    const { bounds, restitution } = this.tuning.probe;
    let vx = this.probe.velocity.x;
    let vy = this.probe.velocity.y + this.tuning.gravity * SIM_DT;
    let x = this.probe.position.x + vx * SIM_DT;
    let y = this.probe.position.y + vy * SIM_DT;

    if (y > bounds.floorY) {
      y = bounds.floorY - (y - bounds.floorY);
      vy = -vy * restitution;
      this.events.push({ type: 'probeBounce', tick: this.tickCount, surface: 'floor' });
    }
    if (x < bounds.minX || x > bounds.maxX) {
      x = x < bounds.minX ? 2 * bounds.minX - x : 2 * bounds.maxX - x;
      vx = -vx;
      this.events.push({ type: 'probeBounce', tick: this.tickCount, surface: 'wall' });
    }
    this.probe = { position: vec2(x, y), velocity: vec2(vx, vy) };
  }
}
