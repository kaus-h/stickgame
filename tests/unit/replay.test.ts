import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { GameRuntime } from '../../src/app/runtime/GameRuntime';
import {
  decodeReplay,
  encodeReplay,
  RecordingIntentSource,
  ReplayError,
  ReplayIntentSource,
  SeededRng,
  vec2,
  type IntentSource,
  type Replay,
} from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { NullPlatformServices } from '../../src/platform';
import { hashSnapshot, type SimEvent } from '../../src/sim';
import {
  HARNESS_BUILD,
  hashRunDirect,
  hashRunFramed,
  makeFixture,
  makeSim,
  movingAnchorFixture,
  recordMainRun,
  recordMovingAnchorRun,
  type Fixture,
} from '../../src/tools/replay-drift/scenario';

const scenarios: { name: string; fixture: Fixture; replay: Replay }[] = (() => {
  const main = makeFixture(lab01, runtimeJson);
  const moving = movingAnchorFixture(lab01, runtimeJson);
  return [
    { name: 'main run', fixture: main, replay: recordMainRun(main) },
    { name: 'moving anchor', fixture: moving, replay: recordMovingAnchorRun(moving) },
  ];
})();

/** Per-tick hashes through a real GameRuntime, hashing the state before each tick. */
function hashRunRuntime(
  fixture: Fixture,
  source: IntentSource,
  ticks: number,
  nextDelta: () => number,
): string[] {
  const hashes: string[] = [];
  const runtime: GameRuntime = new GameRuntime({
    tuning: fixture.tuning,
    level: fixture.level,
    physics: new KinematicPhysicsAdapter(),
    intents: source,
    platform: new NullPlatformServices(),
    now: () => 0,
    beforeTick: () => hashes.push(hashSnapshot(runtime.sim.snapshot())),
  });
  while (runtime.sim.snapshot().tick < ticks) runtime.frame(nextDelta());
  hashes.push(hashSnapshot(runtime.sim.snapshot()));
  return hashes.slice(0, ticks + 1);
}

describe('scripted recordings exercise what they claim to', () => {
  it('main run covers jump, airborne attach, release, death and restart', () => {
    const [{ fixture, replay }] = scenarios as [(typeof scenarios)[number]];
    const sim = makeSim(fixture);
    const source = new ReplayIntentSource(replay);
    const events: SimEvent[] = [];
    for (let t = 0; t < replay.ticks; t++) {
      sim.step(source.poll(t));
      events.push(...sim.drainEvents());
    }
    const types = new Set(events.map((e) => e.type));
    for (const type of ['jump', 'ropeAttach', 'ropeLock', 'ropeRelease', 'death', 'reset']) {
      expect(types.has(type as SimEvent['type']), type).toBe(true);
    }
    const attach = events.find((e) => e.type === 'ropeAttach');
    expect(attach).toMatchObject({ anchor: 0 });
    const intents = replay.inputs.flatMap((i) => i.intents.map((x) => x.type));
    expect(intents).toContain('restart');
    expect(replay.inputs.some((i) => i.intents.some((x) => x.type === 'ropeAim'))).toBe(true);
    expect(JSON.stringify(replay.inputs)).toContain(JSON.stringify(vec2(13.5, 2)));
  });

  it('moving-anchor run attaches to a-moving', () => {
    const { fixture, replay } = scenarios[1] as (typeof scenarios)[number];
    const sim = makeSim(fixture);
    const source = new ReplayIntentSource(replay);
    const events: SimEvent[] = [];
    for (let t = 0; t < replay.ticks; t++) {
      sim.step(source.poll(t));
      events.push(...sim.drainEvents());
    }
    expect(events.find((e) => e.type === 'ropeAttach')).toMatchObject({ anchor: 3 });
    expect(events.some((e) => e.type === 'ropeRelease')).toBe(true);
  });
});

describe.each(scenarios)('replay repeatability: $name', ({ fixture, replay }) => {
  const ticks = replay.ticks;
  const reference = hashRunDirect(fixture, new ReplayIntentSource(replay), ticks);

  it('direct stepping from a recorded run matches the recording run itself', () => {
    // The hashes seen while recording (bot driving) equal those from replaying its inputs.
    expect(reference).toHaveLength(ticks + 1);
    expect(new Set(reference).size).toBeGreaterThan(ticks / 2);
  });

  it('is identical through GameRuntime at 30, 60, 144 Hz and under jitter', () => {
    const rng = new SeededRng(4242);
    const patterns: Record<string, () => number> = {
      '30 Hz': () => 1 / 30,
      '60 Hz': () => 1 / 60,
      '144 Hz': () => 1 / 144,
      jitter: () => 0.003 + rng.next() * 0.045,
    };
    for (const [name, delta] of Object.entries(patterns)) {
      const hashes = hashRunRuntime(fixture, new ReplayIntentSource(replay), ticks, delta);
      expect(hashes, name).toEqual(reference);
    }
  });

  it('is identical through the frame clock with several jitter seeds', () => {
    for (const seed of [1, 7, 31337]) {
      const rng = new SeededRng(seed);
      const hashes = hashRunFramed(
        fixture,
        new ReplayIntentSource(replay),
        ticks,
        () => 0.002 + rng.next() * 0.05,
      );
      expect(hashes, `seed ${String(seed)}`).toEqual(reference);
    }
  });

  it('is identical over 20 repeated runs, each in a fresh world', () => {
    for (let run = 0; run < 20; run++) {
      expect(
        hashRunDirect(fixture, new ReplayIntentSource(replay), ticks),
        `run ${String(run)}`,
      ).toEqual(reference);
    }
  });

  it('survives encode, decode and replay', () => {
    const decoded = decodeReplay(encodeReplay(replay), HARNESS_BUILD);
    expect(decoded.buildMatches).toBe(true);
    expect(decoded.replay).toEqual(replay);
    expect(hashRunDirect(fixture, new ReplayIntentSource(decoded.replay), ticks)).toEqual(
      reference,
    );
  });

  it('records identically when a recorder wraps the playback', () => {
    const recorder = new RecordingIntentSource(new ReplayIntentSource(replay));
    expect(hashRunDirect(fixture, recorder, ticks)).toEqual(reference);
    expect(
      recorder.finish({ build: HARNESS_BUILD, level: replay.level, seed: replay.seed, ticks }),
    ).toEqual(replay);
  });
});

describe('hashSnapshot', () => {
  it('is stable for equal states and sensitive to a single ulp of drift', () => {
    const fixture = makeFixture(lab01, runtimeJson);
    const a = makeSim(fixture);
    const b = makeSim(fixture);
    for (let i = 0; i < 30; i++) {
      a.step([{ type: 'move', axis: 1 }]);
      b.step([{ type: 'move', axis: 1 }]);
    }
    const snap = a.snapshot();
    expect(hashSnapshot(snap)).toBe(hashSnapshot(b.snapshot()));
    expect(hashSnapshot(snap)).toMatch(/^[0-9a-f]{8}$/);

    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, snap.player.velocity.x);
    view.setBigUint64(0, view.getBigUint64(0) + 1n);
    const nudged = {
      ...snap,
      player: { ...snap.player, velocity: { x: view.getFloat64(0), y: snap.player.velocity.y } },
    };
    expect(nudged.player.velocity.x).not.toBe(snap.player.velocity.x);
    expect(hashSnapshot(nudged)).not.toBe(hashSnapshot(snap));
  });
});

describe('replay codec', () => {
  const sample: Replay = {
    version: 1,
    build: 'abc123',
    level: 'lab-01',
    seed: 5,
    ticks: 100,
    inputs: [
      { tick: 0, intents: [{ type: 'move', axis: -0.5 }, { type: 'jumpPress' }] },
      { tick: 10, intents: [{ type: 'ropeAim', target: vec2(13.5, 2.0000000001) }] },
      { tick: 11, intents: [{ type: 'ropePress' }, { type: 'jumpRelease' }] },
      { tick: 40, intents: [{ type: 'ropeRelease' }, { type: 'restart' }, { type: 'pause' }] },
    ],
  };

  it('round-trips exactly and reports build match or mismatch', () => {
    const text = encodeReplay(sample);
    expect(decodeReplay(text, 'abc123')).toEqual({ replay: sample, buildMatches: true });
    expect(decodeReplay(text, 'other').buildMatches).toBe(false);
    expect(text.length).toBeLessThan(300);
  });

  const errorPath = (text: string): string => {
    try {
      decodeReplay(text, 'abc123');
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayError);
      return (error as ReplayError).path;
    }
    throw new Error('expected decodeReplay to throw');
  };
  const tweak = (patch: (raw: Record<string, unknown>) => void): string => {
    const raw = JSON.parse(encodeReplay(sample)) as Record<string, unknown>;
    patch(raw);
    return JSON.stringify(raw);
  };

  it('rejects malformed payloads with the path of the bad field', () => {
    expect(errorPath('not json')).toBe('$');
    expect(errorPath('[]')).toBe('$');
    expect(errorPath(tweak((r) => (r.v = 2)))).toBe('v');
    expect(errorPath(tweak((r) => delete r.b))).toBe('b');
    expect(errorPath(tweak((r) => (r.s = 1.5)))).toBe('s');
    expect(errorPath(tweak((r) => (r.n = -1)))).toBe('n');
    expect(errorPath(tweak((r) => (r.i = 'x')))).toBe('i');
    expect(
      errorPath(
        tweak(
          (r) =>
            (r.i = [
              [5, 'j'],
              [5, 'j'],
            ]),
        ),
      ),
    ).toBe('inputs[1].tick');
    expect(errorPath(tweak((r) => (r.i = [[100, 'j']])))).toBe('inputs[0].tick');
    expect(errorPath(tweak((r) => (r.i = [[3]])))).toBe('inputs[0].intents');
    expect(errorPath(tweak((r) => (r.i = [[3, 'zz']])))).toBe('inputs[0].intents[0]');
    expect(errorPath(tweak((r) => (r.i = [[3, ['m', 2]]])))).toBe('inputs[0].intents[0].axis');
    expect(errorPath(tweak((r) => (r.i = [[3, 'j', ['a', 1, 'y']]])))).toBe(
      'inputs[0].intents[1].target.y',
    );
  });
});
