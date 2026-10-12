import type { RuntimeTuning } from '../../content';
import { decodeReplay, ReplayIntentSource, SIM_HZ, type Replay } from '../../core';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import type { FrameSource } from '../../render';
import {
  hashSnapshot,
  Simulation,
  type LevelDef,
  type SimEvent,
  type SimSnapshot,
} from '../../sim';
import { makeFixture } from '../replay-drift/scenario';

export interface FilmResult {
  readonly tick: number;
  readonly hash: string;
  readonly completion: boolean;
  readonly deaths: number;
}

/**
 * Tick-driven playback for the dev-only film tool. Display refreshes only read state; the capture
 * hook advances recorded inputs explicitly, so rendering and wall time cannot change the route.
 */
export class FilmSession implements FrameSource {
  readonly level: LevelDef;
  readonly tuning: RuntimeTuning;
  readonly replay: Replay;
  private readonly sim: Simulation;
  private readonly inputs: ReplayIntentSource;
  private readonly listeners = new Set<(events: readonly SimEvent[]) => void>();
  private previous: SimSnapshot;
  private current: SimSnapshot;
  private disposed = false;

  constructor(levelJson: unknown, tuningJson: unknown, replayText: string) {
    const fixture = makeFixture(levelJson, tuningJson);
    this.level = fixture.level;
    this.tuning = fixture.tuning;
    this.replay = decodeReplay(replayText, 'dev').replay;
    if (this.replay.level !== this.level.id) {
      throw new Error(`Replay level ${this.replay.level} does not match level ${this.level.id}`);
    }
    this.inputs = new ReplayIntentSource(this.replay);
    this.sim = new Simulation(this.tuning.sim, new KinematicPhysicsAdapter(), this.level, {
      assist: { mode: this.replay.assist ?? 'standard', ...this.tuning.assist },
    });
    this.current = this.sim.snapshot();
    this.previous = this.current;
  }

  advance(): void {
    if (this.disposed) throw new Error('Film session is disposed');
    if (this.current.tick >= this.replay.ticks) throw new Error('Replay has ended');
    this.previous = this.current;
    this.sim.step(this.inputs.poll(this.current.tick));
    this.current = this.sim.snapshot();
    const events = this.sim.drainEvents();
    if (events.length > 0) for (const listener of this.listeners) listener(events);
  }

  onEvents(listener: (events: readonly SimEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // The FrameSource signature accepts display time; capture playback deliberately ignores it.
  frame: FrameSource['frame'] = () => {
    const stats = this.sim.stats();
    return {
      previous: this.previous,
      current: this.current,
      alpha: 1,
      stats: {
        simHz: SIM_HZ,
        stepsLastFrame: 0,
        alpha: 1,
        frameMsAvg: 0,
        frameMsMax: 0,
        simStepMsAvg: 0,
        cappedFrames: 0,
        droppedSeconds: 0,
        tick: stats.tick,
        attemptTick: stats.attemptTick,
        resets: stats.resets,
        entities: stats.entities,
        bodies: stats.physics.bodies,
        joints: stats.physics.joints,
        paused: true,
      },
    };
  };

  result(): FilmResult {
    return {
      tick: this.current.tick,
      hash: hashSnapshot(this.current),
      completion: this.current.completion !== null,
      deaths: this.current.deaths,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.sim.dispose();
  }
}
