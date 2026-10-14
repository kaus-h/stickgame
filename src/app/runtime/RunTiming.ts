import {
  decodeReplay,
  REPLAY_VERSION,
  ReplayError,
  type AssistMode,
  type Intent,
  type InputDevice,
  type Replay,
  type ReplayInput,
} from '../../core';
import type { PhysicsAdapter } from '../../physics';
import type { PersonalBest } from '../../platform';
import type { RaceView, SplitFlash } from '../../render';
import {
  levelFingerprint,
  Simulation,
  STANDARD_ASSIST,
  type LevelDef,
  type SimEvent,
  type SimSnapshot,
  type SimTuning,
  type TargetAssist,
} from '../../sim';

/** A PB that passed validation for this level version and build, ready to drive the ghost. */
export interface ValidPb {
  readonly ticks: number;
  readonly splits: readonly (number | null)[];
  readonly replay: Replay;
}

/** Everything the results screen and the save need about a finished run (GMR-103). */
export interface RunSummary {
  readonly inputDevice: InputDevice;
  readonly runTicks: number;
  /** Deaths in this run (since the last restart). */
  readonly deaths: number;
  /** Lives played in this run, the finishing one included. */
  readonly lives: number;
  /** Length of every life of the run, in order, the finishing one last. */
  readonly lifeTicks: readonly number[];
  readonly bestLifeTicks: number;
  /** Run time at each checkpoint (first reach), by index; null where skipped. */
  readonly splits: readonly (number | null)[];
  /** The PB before this run, or null if there was none. */
  readonly previousPb: ValidPb | null;
  /** True when this run is the new PB (first clear with a replay, or faster). */
  readonly isPb: boolean;
  /** The run as an input replay; null when it could not be recorded (too long). */
  readonly replay: Replay | null;
}

export interface RunTimingDeps {
  /** Runtime's active hardware adapter; tags runs without affecting playback. */
  readonly inputDevice?: () => InputDevice;
  readonly tuning: SimTuning;
  readonly level: LevelDef;
  /** A physics world of the ghost's own; the live simulation's world is never shared. */
  readonly physics: PhysicsAdapter;
  /** Build identity stamped into recorded replays. */
  readonly build: string;
  /** Aim-assist parameters for replaying a PB recorded with an assist tier. */
  readonly assist?: Omit<TargetAssist, 'mode'>;
}

/** Runs longer than this (30 min) are timed but not recorded as a replay. */
const MAX_REPLAY_TICKS = 60 * 60 * 30;
const MAX_REPLAY_ENTRIES = 50_000;
const GHOST_LINGER_TICKS = 60;

/**
 * Validate a saved PB (GMR-103) against the current level version and build. Anything that does not
 * fit is rejected with a reason, never played back against the wrong geometry or code.
 */
export function validatePb(
  stored: PersonalBest,
  level: LevelDef,
  build: string,
): { readonly pb: ValidPb } | { readonly reason: string } {
  if (stored.levelVersion !== levelFingerprint(level)) return { reason: 'level version changed' };
  let replay: Replay;
  try {
    const decoded = decodeReplay(stored.replay, build);
    if (!decoded.buildMatches) return { reason: `recorded on build ${decoded.replay.build}` };
    replay = decoded.replay;
  } catch (error) {
    return { reason: error instanceof ReplayError ? error.message : 'unreadable replay' };
  }
  if (replay.level !== level.id) return { reason: `replay is for level ${replay.level}` };
  if (replay.ticks !== stored.ticks) return { reason: 'replay length does not match the PB time' };
  const checkpoints = level.checkpoints?.length ?? 0;
  if (stored.splits.length !== checkpoints) return { reason: 'split count does not match' };
  return { pb: { ticks: stored.ticks, splits: stored.splits, replay } };
}

/**
 * Racing-style run timing (GMR-103, owner decision 2026-10-08, modelled on Trackmania). Watches the
 * live simulation tick by tick: records the current run as an input replay (from the last full
 * restart), collects lives and checkpoint splits, and plays the PB replay in a second, headless
 * simulation in lockstep with the run clock, which is the PB ghost. Never touches the live
 * simulation's state.
 */
export class RunTiming {
  private level: LevelDef;
  private readonly ghostSim: Simulation;
  private pb: ValidPb | null = null;
  private ghostByTick = new Map<number, readonly Intent[]>();
  private ghostVisible = true;

  // Current run.
  private pendingStart = true;
  private running = false;
  private runStartTick = 0;
  private inputs: ReplayInput[] = [];
  private replayOverflow = false;
  private assist: AssistMode = 'standard';
  private splits: (number | null)[] = [];
  private lives: number[] = [];
  private deaths = 0;
  private split: SplitFlash | null = null;
  private result: RunSummary | null = null;

  // Ghost lockstep.
  private ghostIndex = 0;
  private ghostRunning = false;
  private ghostPrevious: SimSnapshot | null = null;
  private ghostCurrent: SimSnapshot | null = null;
  private liveRunTick = 0;

  /** Level ticks already handed to the save (time to first clear). */
  private flushedLevelTick = 0;

  constructor(private readonly deps: RunTimingDeps) {
    this.level = deps.level;
    this.ghostSim = new Simulation(deps.tuning, deps.physics, deps.level);
    this.splits = this.emptySplits();
  }

  /** A new level in the same worlds: the next tick starts a fresh run; the PB must be set again. */
  replaceLevel(level: LevelDef): void {
    this.level = level;
    this.ghostSim.replaceLevel(level);
    this.setPb(null);
    this.pendingStart = true;
    this.running = false;
    this.flushedLevelTick = 0;
    this.split = null;
    this.result = null;
    this.splits = this.emptySplits();
  }

  /** The validated PB for the current level, or null. The ghost starts with the next run. */
  setPb(pb: ValidPb | null): void {
    this.pb = pb;
    this.ghostByTick = new Map(pb ? pb.replay.inputs.map((i) => [i.tick, i.intents]) : []);
    this.ghostRunning = false;
    this.ghostPrevious = null;
    this.ghostCurrent = null;
  }

  get personalBest(): ValidPb | null {
    return this.pb;
  }

  setGhostVisible(visible: boolean): void {
    this.ghostVisible = visible;
  }

  get ghostEnabled(): boolean {
    return this.ghostVisible;
  }

  /**
   * Before the live simulation steps with `intents`: detects the start of a run (level load,
   * restart, or the respawn intent with no checkpoint reached) and records the inputs.
   */
  beforeStep(sim: Simulation, intents: readonly Intent[]): void {
    const s = sim.snapshot();
    const restart = intents.some((i) => i.type === 'restart');
    const respawnAsRestart =
      !restart && !s.completion && s.checkpoint < 0 && intents.some((i) => i.type === 'respawn');
    if (this.pendingStart || restart || respawnAsRestart) {
      this.startRun(sim, s, intents);
      return;
    }
    if (!this.running || s.completion) return; // a finished run ignores input until restart
    const kept = intents.filter((i) => i.type !== 'pause' && i.type !== 'ghostToggle');
    if (kept.length === 0) return;
    if (this.inputs.length >= MAX_REPLAY_ENTRIES) this.replayOverflow = true;
    else this.inputs.push({ tick: s.tick - this.runStartTick, intents: kept });
  }

  /** After the live step, with the events that step produced. */
  afterStep(sim: Simulation, events: readonly SimEvent[]): void {
    for (const e of events) this.onEvent(sim, e);
    this.advanceGhost(sim.snapshot().runTick);
  }

  /** The finished run, once, after its exit event. */
  takeResult(): RunSummary | null {
    const r = this.result;
    this.result = null;
    return r;
  }

  /** Play ticks since the last call (for the save's time to first clear). */
  takePlayTicks(sim: Simulation): number {
    const now = sim.snapshot().levelTick;
    const delta = Math.max(0, now - this.flushedLevelTick);
    this.flushedLevelTick = now;
    return delta;
  }

  view(): RaceView {
    // The ghost lingers a second at the finish, then leaves the page.
    const finished = this.pb !== null && this.liveRunTick > this.pb.ticks + GHOST_LINGER_TICKS;
    const ghost =
      this.pb && this.ghostVisible && this.ghostRunning && this.ghostCurrent && !finished
        ? { previous: this.ghostPrevious ?? this.ghostCurrent, current: this.ghostCurrent }
        : null;
    return {
      pb: this.pb ? { ticks: this.pb.ticks, splits: this.pb.splits } : null,
      ghostEnabled: this.ghostVisible,
      ghost,
      split: this.split,
    };
  }

  /** Lives so far in the current run (finished lives), for tests and diagnostics. */
  get lifeTicks(): readonly number[] {
    return this.lives;
  }

  dispose(): void {
    this.ghostSim.dispose();
  }

  // --- internals ---------------------------------------------------------------------------------

  private startRun(sim: Simulation, s: SimSnapshot, intents: readonly Intent[]): void {
    this.pendingStart = false;
    this.running = true;
    this.runStartTick = s.tick;
    this.assist = s.assist;
    this.replayOverflow = false;
    this.splits = this.emptySplits();
    this.lives = [];
    this.deaths = 0;
    this.split = null;
    this.result = null;
    // Tick 0 rebuilds the held controller state, then restarts: a fresh simulation fed this replay
    // plays the run exactly as the live one did (the live one may have restarted mid-hold).
    const kept = intents.filter(
      (i) => i.type !== 'pause' && i.type !== 'ghostToggle' && i.type !== 'restart',
    );
    this.inputs = [{ tick: 0, intents: [...sim.carryIntents(), { type: 'restart' }, ...kept] }];
    // The ghost restarts with the run.
    if (this.pb) {
      this.ghostSim.clearController();
      this.ghostSim.setAssist(
        this.pb.replay.assist && this.deps.assist
          ? { mode: this.pb.replay.assist, ...this.deps.assist }
          : STANDARD_ASSIST,
      );
      this.ghostIndex = 0;
      this.ghostRunning = true;
      this.ghostPrevious = null;
      this.ghostCurrent = null;
    }
  }

  private onEvent(sim: Simulation, e: SimEvent): void {
    if (!this.running) return;
    switch (e.type) {
      case 'checkpoint':
        if (this.splits[e.index] == null) this.splits[e.index] = e.runTicks;
        this.split = {
          kind: 'checkpoint',
          index: e.index,
          ticks: e.runTicks,
          pbTicks: this.pb?.splits[e.index] ?? null,
          tick: e.tick,
        };
        break;
      case 'death':
        this.deaths++;
        break;
      case 'lifeEnd':
        if (e.reason !== 'restart') this.lives.push(e.lifeTicks);
        break;
      case 'exit':
        this.finish(sim, e.runTicks, e.tick);
        break;
      default:
        break;
    }
  }

  private finish(sim: Simulation, runTicks: number, tick: number): void {
    this.running = false;
    const recordable = !this.replayOverflow && runTicks <= MAX_REPLAY_TICKS;
    const replay: Replay | null = recordable
      ? {
          version: REPLAY_VERSION,
          build: this.deps.build,
          level: this.level.id,
          seed: 0,
          inputDevice: this.deps.inputDevice?.() ?? 'unknown',
          ...(this.assist !== 'standard' ? { assist: this.assist } : {}),
          ticks: runTicks,
          inputs: this.inputs.slice(),
        }
      : null;
    const previousPb = this.pb;
    this.split = {
      kind: 'exit',
      index: this.level.checkpoints?.length ?? 0,
      ticks: runTicks,
      pbTicks: previousPb?.ticks ?? null,
      tick,
    };
    const lives = this.lives.length > 0 ? this.lives : [sim.snapshot().lifeTick];
    this.result = {
      inputDevice: this.deps.inputDevice?.() ?? 'unknown',
      runTicks,
      deaths: this.deaths,
      lives: lives.length,
      lifeTicks: lives.slice(),
      bestLifeTicks: Math.max(...lives),
      splits: this.splits.slice(),
      previousPb,
      isPb: replay !== null && (previousPb === null || runTicks < previousPb.ticks),
      replay,
    };
  }

  /** Step the ghost up to the live run clock (never past the end of the PB replay). */
  private advanceGhost(liveRunTick: number): void {
    const pb = this.pb;
    if (!pb || !this.ghostRunning) return;
    const target = Math.min(liveRunTick, pb.replay.ticks);
    while (this.ghostIndex < target) {
      this.ghostSim.step(this.ghostByTick.get(this.ghostIndex) ?? []);
      this.ghostSim.drainEvents();
      this.ghostIndex++;
      this.ghostPrevious = this.ghostCurrent;
      this.ghostCurrent = this.ghostSim.snapshot();
    }
    // Holding still (the PB has finished): nothing to blend.
    if (liveRunTick > pb.replay.ticks) this.ghostPrevious = this.ghostCurrent;
    this.liveRunTick = liveRunTick;
  }

  private emptySplits(): (number | null)[] {
    return (this.level.checkpoints ?? []).map(() => null);
  }
}
