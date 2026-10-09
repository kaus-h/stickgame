import { FixedStepClock, SIM_DT, SIM_HZ, type IntentSource } from '../../core';
import type { RuntimeTuning } from '../../content';
import type { PhysicsAdapter } from '../../physics';
import type { PlatformServices } from '../../platform';
import type { FrameSource, RenderFrame, RuntimeStats } from '../../render';
import {
  Simulation,
  type LevelDef,
  type SimEvent,
  type SimSnapshot,
  type TargetAssist,
} from '../../sim';
import type { RunTiming } from './RunTiming';

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
  /** Opt-in aim assist (GMR-27); omitted = standard. */
  readonly assist?: TargetAssist;
  /** Racing-style run timing and the PB ghost (GMR-103); omitted in tools and labs. */
  readonly timing?: RunTiming;
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
  /** Why the game is paused (tab hidden, pause menu, title screen); runs only when empty. */
  private readonly pauseReasons = new Set<string>();
  private readonly unsubscribe: () => void;
  private readonly eventListeners = new Set<(events: readonly SimEvent[]) => void>();
  /** Events collected step by step (timing needs them per tick), delivered once per frame. */
  private pendingEvents: SimEvent[] = [];

  private frameMs: number[] = [];
  private simStepMsTotal = 0;
  private simSteps = 0;
  private cappedFrames = 0;
  private droppedSeconds = 0;
  private lastSteps = 0;
  private lastAlpha = 0;

  constructor(private readonly deps: GameRuntimeDeps) {
    this.sim = new Simulation(
      deps.tuning.sim,
      deps.physics,
      deps.level,
      deps.assist ? { assist: deps.assist } : {},
    );
    this.clock = new FixedStepClock({ dt: SIM_DT, ...deps.tuning.clock });
    this.current = this.sim.snapshot();
    this.previous = this.current;
    this.unsubscribe = deps.platform.onVisibilityChange((visible) => {
      this.pause('hidden', !visible);
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

    const events = this.pendingEvents;
    this.pendingEvents = [];
    events.push(...this.sim.drainEvents());
    if (events.length > 0) for (const listener of this.eventListeners) listener(events);

    const race = this.deps.timing?.view();
    return {
      previous: this.previous,
      current: this.current,
      alpha: this.lastAlpha,
      stats: this.stats(),
      ...(race ? { race } : {}),
    };
  }

  /** Pause stops the clock without accumulating time, so resuming never bursts through catch-up steps. */
  setPaused(paused: boolean): void {
    this.pause('manual', paused);
  }

  /**
   * Pause for a named reason. The runtime runs only when no reason holds, so returning to a visible
   * tab cannot resume a game the player paused from the menu (GMR-47).
   */
  pause(reason: string, on: boolean): void {
    if (on) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    const paused = this.pauseReasons.size > 0;
    if (paused !== this.paused) this.clock.reset();
    this.paused = paused;
  }

  /** Reload level data in the same simulation/physics world, with no stale interpolation. */
  replaceLevel(level: LevelDef): void {
    this.sim.replaceLevel(level);
    this.deps.timing?.replaceLevel(level);
    this.pendingEvents = [];
    this.clock.reset();
    this.current = this.sim.snapshot();
    this.previous = this.current;
    this.lastSteps = 0;
    this.lastAlpha = 0;
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
    this.deps.timing?.dispose();
  }

  private step(): void {
    const start = this.deps.now();
    this.previous = this.current;
    this.deps.beforeTick?.();
    const intents = this.deps.intents.poll(this.sim.snapshot().tick);
    const timing = this.deps.timing;
    timing?.beforeStep(this.sim, intents);
    this.sim.step(intents);
    const events = this.sim.drainEvents();
    timing?.afterStep(this.sim, events);
    for (const e of events) this.pendingEvents.push(e);
    this.current = this.sim.snapshot();
    this.simStepMsTotal += this.deps.now() - start;
    this.simSteps++;
  }

  private recordFrameTime(ms: number): void {
    this.frameMs.push(ms);
    if (this.frameMs.length > FRAME_WINDOW) this.frameMs.shift();
  }
}
