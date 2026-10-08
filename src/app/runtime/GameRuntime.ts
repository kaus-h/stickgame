import { FixedStepClock, SIM_DT, SIM_HZ, type IntentSource } from '../../core';
import type { RuntimeTuning } from '../../content';
import type { PhysicsAdapter } from '../../physics';
import type { PlatformServices } from '../../platform';
import type { FrameSource, RenderFrame, RuntimeStats } from '../../render';
import { Simulation, type LevelDef, type SimEvent, type SimSnapshot } from '../../sim';

export interface GameRuntimeDeps {
  readonly tuning: RuntimeTuning;
  readonly level: LevelDef;
  readonly physics: PhysicsAdapter;
  readonly intents: IntentSource;
  readonly platform: PlatformServices;
  /** Wall-clock milliseconds, used only to measure cost. Never fed into the simulation. */
  readonly now: () => number;
  /** Called before each simulation tick, e.g. so device adapters can re-aim under a moving camera. */
  readonly beforeTick?: () => void;
}

const FRAME_WINDOW = 120;

/**
 * Owns the simulation loop: turns real frame time into fixed simulation steps, feeds intents,
 * keeps the two latest snapshots for interpolation and collects timing counters.
 */
export class GameRuntime implements FrameSource {
  readonly sim: Simulation;
  private readonly clock: FixedStepClock;
  private previous: SimSnapshot;
  private current: SimSnapshot;
  private paused = false;
  private readonly unsubscribe: () => void;
  private readonly eventListeners = new Set<(events: readonly SimEvent[]) => void>();

  private frameMs: number[] = [];
  private simStepMsTotal = 0;
  private simSteps = 0;
  private cappedFrames = 0;
  private droppedSeconds = 0;
  private lastSteps = 0;
  private lastAlpha = 0;

  constructor(private readonly deps: GameRuntimeDeps) {
    this.sim = new Simulation(deps.tuning.sim, deps.physics, deps.level);
    this.clock = new FixedStepClock({ dt: SIM_DT, ...deps.tuning.clock });
    this.current = this.sim.snapshot();
    this.previous = this.current;
    this.unsubscribe = deps.platform.onVisibilityChange((visible) => {
      this.setPaused(!visible);
    });
  }

  frame(deltaSeconds: number): RenderFrame {
    this.recordFrameTime(deltaSeconds * 1000);

    if (!this.paused) {
      const advance = this.clock.advance(deltaSeconds);
      for (let i = 0; i < advance.steps; i++) this.step();
      if (advance.droppedSeconds > 0) {
        this.cappedFrames++;
        this.droppedSeconds += advance.droppedSeconds;
      }
      this.lastSteps = advance.steps;
      this.lastAlpha = advance.alpha;
    } else {
      this.lastSteps = 0;
    }

    const events = this.sim.drainEvents();
    if (events.length > 0) for (const listener of this.eventListeners) listener(events);

    return {
      previous: this.previous,
      current: this.current,
      alpha: this.lastAlpha,
      stats: this.stats(),
    };
  }

  /** Pause stops the clock without accumulating time, so resuming never bursts through catch-up steps. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock.reset();
  }

  onEvents(listener: (events: readonly SimEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  get listenerCount(): number {
    return this.eventListeners.size;
  }

  stats(): RuntimeStats {
    const sim = this.sim.stats();
    const frames = this.frameMs;
    const frameMsAvg = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
    return {
      simHz: SIM_HZ,
      stepsLastFrame: this.lastSteps,
      alpha: this.lastAlpha,
      frameMsAvg,
      frameMsMax: frames.length ? Math.max(...frames) : 0,
      simStepMsAvg: this.simSteps ? this.simStepMsTotal / this.simSteps : 0,
      cappedFrames: this.cappedFrames,
      droppedSeconds: this.droppedSeconds,
      tick: sim.tick,
      attemptTick: sim.attemptTick,
      resets: sim.resets,
      entities: sim.entities,
      bodies: sim.physics.bodies,
      joints: sim.physics.joints,
      paused: this.paused,
    };
  }

  dispose(): void {
    this.unsubscribe();
    this.eventListeners.clear();
    this.sim.dispose();
  }

  private step(): void {
    const start = this.deps.now();
    this.previous = this.current;
    this.deps.beforeTick?.();
    this.sim.step(this.deps.intents.poll(this.sim.snapshot().tick));
    this.current = this.sim.snapshot();
    this.simStepMsTotal += this.deps.now() - start;
    this.simSteps++;
  }

  private recordFrameTime(ms: number): void {
    this.frameMs.push(ms);
    if (this.frameMs.length > FRAME_WINDOW) this.frameMs.shift();
  }
}
