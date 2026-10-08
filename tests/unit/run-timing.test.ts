import { describe, expect, it } from 'vitest';
import level11Json from '../../content/levels/1-1.json';
import solution11 from '../../content/solutions/1-1.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { RunTiming, validatePb, type RunSummary } from '../../src/app/runtime/RunTiming';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import {
  decodeReplay,
  encodeReplay,
  ReplayIntentSource,
  vec2,
  type Intent,
  type Replay,
} from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { recordRun, type PersonalBest } from '../../src/platform';
import { formatDelta, formatRaceTime } from '../../src/render/race';
import {
  hashSnapshot,
  levelFingerprint,
  Simulation,
  type LevelDef,
  type SimEvent,
} from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson).sim;
const level11 = parseLevel(level11Json);
const solution = decodeReplay(solution11.replay, 'dev').replay;

const box = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'solid' | 'hazard' = 'solid',
) => ({
  id,
  kind,
  points: [vec2(x, y), vec2(x + w, y), vec2(x + w, y + h), vec2(x, y + h)],
});

/** A long floor with two checkpoints, then a pit of lava (as in checkpoints.test.ts). */
const cpLevel: LevelDef = {
  id: 'cp-race',
  name: 'cp',
  spawn: vec2(1, 7.65),
  bounds: { minX: 0, minY: -5, maxX: 60, maxY: 12 },
  killY: 14,
  solids: [box('floor', 0, 8, 30, 2), box('lava', 30, 11, 30, 1, 'hazard')],
  anchors: [],
  checkpoints: [
    { id: 'cp-a', position: vec2(10, 7.65) },
    { id: 'cp-b', position: vec2(20, 7.65) },
  ],
};

const make = (level: LevelDef = cpLevel) =>
  new Simulation(tuning, new KinematicPhysicsAdapter(), level);

function stepN(sim: Simulation, n: number, first: Intent[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step(i === 0 ? first : []);
    events.push(...sim.drainEvents());
  }
  return events;
}

const lifeEnds = (events: readonly SimEvent[]) =>
  events.filter((e): e is Extract<SimEvent, { type: 'lifeEnd' }> => e.type === 'lifeEnd');

describe('run clocks (GMR-103)', () => {
  it('a death ends the life; the next life starts at 0 while the run clock keeps counting', () => {
    const sim = make();
    const events = stepN(sim, 600, [{ type: 'move', axis: 1 }]);
    const deaths = events.filter((e) => e.type === 'death');
    expect(deaths.length).toBeGreaterThan(0);
    const ends = lifeEnds(events);
    expect(ends[0]).toMatchObject({ reason: 'death', life: 1 });
    const death = deaths[0] as Extract<SimEvent, { type: 'death' }>;
    expect(ends[0]?.lifeTicks).toBe(death.attemptTicks);
    expect(ends[0]?.runTicks).toBe(death.attemptTicks); // first life: life time = run time
    const s = sim.snapshot();
    expect(s.lives).toBe(deaths.length + 1);
    expect(s.runTick).toBe(600);
    expect(s.levelTick).toBe(600);
    expect(s.lifeTick).toBe(s.attemptTick);
    expect(s.lifeTick).toBeLessThan(s.runTick);
  });

  it('the respawn intent returns to the active checkpoint at rest and keeps the run clock', () => {
    const sim = make();
    stepN(sim, 240, [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().checkpoint).toBe(1);
    stepN(sim, 30, [{ type: 'move', axis: 0 }]);
    const before = sim.snapshot();
    sim.step([{ type: 'respawn' }]);
    const events = sim.drainEvents();
    const s = sim.snapshot();
    expect(lifeEnds(events)).toEqual([
      {
        type: 'lifeEnd',
        tick: before.tick,
        life: before.lives,
        lifeTicks: before.lifeTick,
        runTicks: before.runTick,
        reason: 'respawn',
      },
    ]);
    expect(events.find((e) => e.type === 'respawn')).toMatchObject({
      checkpoint: 1,
      voluntary: true,
    });
    expect(s.player.position.x).toBeCloseTo(20, 6);
    expect(s.player.velocity.x).toBe(0);
    expect(s.runTick).toBe(before.runTick + 1);
    expect(s.lifeTick).toBe(1);
    expect(s.lives).toBe(before.lives + 1);
    expect(s.respawns).toBe(1);
    expect(s.deaths).toBe(before.deaths);
    expect(s.checkpoint).toBe(1);
  });

  it('the respawn intent with no checkpoint reached is a restart', () => {
    const sim = make();
    stepN(sim, 30, [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().checkpoint).toBe(-1);
    sim.step([{ type: 'respawn' }]);
    const events = sim.drainEvents();
    const s = sim.snapshot();
    expect(lifeEnds(events)[0]?.reason).toBe('restart');
    expect(s.runTick).toBe(1);
    expect(s.lives).toBe(1);
    expect(s.respawns).toBe(0);
    expect(s.levelTick).toBe(31);
    expect(s.player.position.x).toBeLessThan(1.2);
  });

  it('restart starts a fresh run (run clock and lives) but the level clock keeps counting', () => {
    const sim = make();
    stepN(sim, 600, [{ type: 'move', axis: 1 }]);
    expect(sim.snapshot().lives).toBeGreaterThan(1);
    sim.step([{ type: 'restart' }]);
    const s = sim.snapshot();
    expect(s.runTick).toBe(1);
    expect(s.lifeTick).toBe(1);
    expect(s.lives).toBe(1);
    expect(s.levelTick).toBe(601);
  });

  it('completion ends the last life; the clocks hold until restart', () => {
    const sim = make(level11);
    const source = new ReplayIntentSource(solution);
    const events: SimEvent[] = [];
    for (let t = 0; t < solution.ticks; t++) {
      sim.step(source.poll(t));
      events.push(...sim.drainEvents());
    }
    const exit = events.find((e) => e.type === 'exit');
    expect(exit).toBeDefined();
    const ends = lifeEnds(events);
    expect(ends.at(-1)).toMatchObject({ reason: 'exit', life: 1 });
    const done = sim.snapshot();
    expect(done.completion).not.toBeNull();
    stepN(sim, 50);
    expect(sim.snapshot().runTick).toBe(done.runTick);
    expect(sim.snapshot().levelTick).toBe(done.levelTick);
    // Restarting after the exit does not end another life.
    sim.step([{ type: 'restart' }]);
    expect(lifeEnds(sim.drainEvents())).toEqual([]);
    expect(sim.snapshot().levelTick).toBe(done.levelTick + 1);
  });

  it('time to first clear adds play time across runs and is recorded once', () => {
    let r = recordRun(undefined, { cleared: false, ticks: 0, deaths: 3, playTicks: 1000 });
    r = recordRun(r, { cleared: false, ticks: 0, deaths: 1, playTicks: 500 });
    r = recordRun(r, { cleared: true, ticks: 900, deaths: 0, playTicks: 900 });
    expect(r.firstClearTicks).toBe(2400);
    expect(r.playTicks).toBe(2400);
    r = recordRun(r, { cleared: true, ticks: 800, deaths: 0, playTicks: 800 });
    expect(r.firstClearTicks).toBe(2400); // never overwritten
    expect(r.playTicks).toBe(3200);
    expect(r.bestTicks).toBe(800);
  });

  it('the replay hash covers the respawn intent and the replay format records it', () => {
    const play = (useRespawn: boolean) => {
      const sim = make();
      stepN(sim, 240, [{ type: 'move', axis: 1 }]);
      stepN(sim, 20, [{ type: 'move', axis: 0 }]);
      sim.step(useRespawn ? [{ type: 'respawn' }] : []);
      stepN(sim, 20);
      return hashSnapshot(sim.snapshot());
    };
    expect(play(true)).toBe(play(true));
    expect(play(true)).not.toBe(play(false));
    const replay: Replay = {
      version: 1,
      build: 'dev',
      level: 'cp-race',
      seed: 0,
      ticks: 10,
      inputs: [{ tick: 3, intents: [{ type: 'respawn' }, { type: 'ghostToggle' }] }],
    };
    expect(decodeReplay(encodeReplay(replay), 'dev').replay).toEqual(replay);
  });
});

/** The app's per-tick wiring (GameRuntime.step) without the frame clock. */
function liveStep(sim: Simulation, timing: RunTiming, intents: Intent[]): void {
  timing.beforeStep(sim, intents);
  sim.step(intents);
  timing.afterStep(sim, sim.drainEvents());
}

/** Restart (holding right, with a stale aim) and play the 1-1 solution to the exit. */
function playSolutionRun(
  sim: Simulation,
  timing: RunTiming,
  onTick?: (t: number) => void,
): RunSummary {
  const source = new ReplayIntentSource(solution);
  for (let t = 0; t < solution.ticks; t++) {
    const intents = [...source.poll(t)];
    if (t === 0) intents.unshift({ type: 'restart' });
    liveStep(sim, timing, intents);
    onTick?.(t);
  }
  const result = timing.takeResult();
  if (!result) throw new Error('run did not finish');
  return result;
}

const makeTiming = (level: LevelDef = level11) =>
  new RunTiming({ tuning, level, physics: new KinematicPhysicsAdapter(), build: 'dev' });

describe('RunTiming and the PB ghost (GMR-103)', () => {
  it('records lives, splits and the run replay; the ghost replays the PB tick-exactly', () => {
    const sim = make(level11);
    const timing = makeTiming();
    // Some messy play first: aim somewhere, hold right, die or wander, then restart mid-hold.
    liveStep(sim, timing, [
      { type: 'ropeAim', target: vec2(5, 1) },
      { type: 'move', axis: 1 },
    ]);
    for (let i = 0; i < 400; i++) liveStep(sim, timing, []);
    const first = playSolutionRun(sim, timing);
    expect(first.runTicks).toBe(solution11.totalTicks);
    expect(first.isPb).toBe(true);
    expect(first.previousPb).toBeNull();
    expect(first.splits).toHaveLength(2);
    expect(first.splits.every((s) => s !== null && s > 0 && s < first.runTicks)).toBe(true);
    expect(first.lives).toBe(1);
    expect(first.lifeTicks).toEqual([first.runTicks]);
    expect(first.bestLifeTicks).toBe(first.runTicks);
    const replay = first.replay;
    if (!replay) throw new Error('no replay');

    // A fresh simulation fed the recorded replay finishes the same run.
    const fresh = make(level11);
    const source = new ReplayIntentSource(decodeReplay(encodeReplay(replay), 'dev').replay);
    for (let t = 0; t < replay.ticks; t++) fresh.step(source.poll(t));
    expect(fresh.snapshot().completion?.runTicks).toBe(first.runTicks);

    // Second run with the PB set: the ghost matches the live run on every tick.
    timing.setPb({ ticks: first.runTicks, splits: first.splits, replay });
    let compared = 0;
    const second = playSolutionRun(sim, timing, () => {
      const ghost = timing.view().ghost;
      if (!ghost) throw new Error('ghost missing');
      const live = sim.snapshot();
      expect(ghost.current.runTick).toBe(live.runTick);
      expect(ghost.current.player.position).toEqual(live.player.position);
      expect(ghost.current.player.velocity).toEqual(live.player.velocity);
      compared++;
    });
    expect(compared).toBe(solution.ticks);
    expect(second.isPb).toBe(false); // equal time is not a new PB
    expect(second.previousPb?.ticks).toBe(first.runTicks);
    // The ghost's end state hashes the same as an independent headless playback of the PB.
    const ghostEnd = timing.view().ghost?.current;
    if (!ghostEnd) throw new Error('ghost missing at the end');
    const reference = make(level11);
    const again = new ReplayIntentSource(replay);
    for (let t = 0; t < replay.ticks; t++) reference.step(again.poll(t));
    const strip = (s: ReturnType<Simulation['snapshot']>) =>
      hashSnapshot({ ...s, tick: 0, resets: 0, deaths: 0 });
    expect(strip(ghostEnd)).toBe(strip(reference.snapshot()));
    // The exit split compares against the PB time.
    expect(timing.view().split).toMatchObject({
      kind: 'exit',
      ticks: second.runTicks,
      pbTicks: first.runTicks,
    });
    timing.dispose();
  });

  it('checkpoint splits carry the PB split; the respawn intent adds a life', () => {
    const sim = make();
    const timing = makeTiming(cpLevel);
    timing.setPb({
      ticks: 999,
      splits: [50, 120],
      replay: { version: 1, build: 'dev', level: 'cp-race', seed: 0, ticks: 999, inputs: [] },
    });
    liveStep(sim, timing, [{ type: 'move', axis: 1 }]);
    let flash = null;
    for (let i = 0; i < 240; i++) {
      liveStep(sim, timing, []);
      const split = timing.view().split;
      if (split?.index === 0 && !flash) flash = split;
    }
    expect(flash).toMatchObject({ kind: 'checkpoint', index: 0, pbTicks: 50 });
    expect(timing.view().split).toMatchObject({ kind: 'checkpoint', index: 1, pbTicks: 120 });
    liveStep(sim, timing, [{ type: 'respawn' }]);
    expect(timing.lifeTicks).toHaveLength(1);
    expect(sim.snapshot().lives).toBe(2);
    timing.dispose();
  });

  it('a stale PB is rejected with a reason, never played back', () => {
    const replay: Replay = { ...solution, build: 'dev' };
    const good: PersonalBest = {
      ticks: replay.ticks,
      splits: [100, 400],
      replay: encodeReplay(replay),
      levelVersion: levelFingerprint(level11),
    };
    expect(validatePb(good, level11, 'dev')).toHaveProperty('pb');
    const moved = { ...level11, spawn: vec2(level11.spawn.x + 0.5, level11.spawn.y) };
    expect(validatePb(good, moved, 'dev')).toEqual({ reason: 'level version changed' });
    expect(validatePb(good, level11, 'other-build')).toHaveProperty('reason');
    expect(validatePb({ ...good, replay: '{"v":1' }, level11, 'dev')).toHaveProperty('reason');
    expect(validatePb({ ...good, replay: '{"v":99}' }, level11, 'dev')).toHaveProperty('reason');
    expect(validatePb({ ...good, ticks: 5 }, level11, 'dev')).toHaveProperty('reason');
    expect(validatePb({ ...good, splits: [1] }, level11, 'dev')).toHaveProperty('reason');
  });
});

describe('race formats (GMR-103)', () => {
  it('always signs the delta so colour is never the only channel', () => {
    expect(formatDelta(-25)).toEqual({ text: '−0.42', tone: 'faster' });
    expect(formatDelta(25)).toEqual({ text: '+0.42', tone: 'slower' });
    expect(formatDelta(0)).toEqual({ text: '±0.00', tone: 'even' });
    expect(formatRaceTime(3725)).toBe('01:02.08');
  });
});
