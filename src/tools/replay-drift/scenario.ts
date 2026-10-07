import {
  decodeReplay,
  encodeReplay,
  FixedStepClock,
  RecordingIntentSource,
  SeededRng,
  ReplayIntentSource,
  SIM_DT,
  vec2,
  type Intent,
  type IntentSource,
  type Replay,
} from '../../core';
import { parseLevel, parseRuntimeTuning, type RuntimeTuning } from '../../content';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { hashSnapshot, Simulation, type LevelDef, type SimSnapshot } from '../../sim';

/** Build tag stamped on recorded replays in tests and the drift page. */
export const HARNESS_BUILD = 'harness';

export interface Fixture {
  readonly level: LevelDef;
  readonly tuning: RuntimeTuning;
}

export function makeFixture(levelJson: unknown, tuningJson: unknown): Fixture {
  return { level: parseLevel(levelJson), tuning: parseRuntimeTuning(tuningJson) };
}

export function makeSim(fixture: Fixture): Simulation {
  return new Simulation(fixture.tuning.sim, new KinematicPhysicsAdapter(), fixture.level);
}

/** Hash of the state before each tick 0..ticks-1, then after the last tick (ticks + 1 entries). */
export function hashRunDirect(fixture: Fixture, source: IntentSource, ticks: number): string[] {
  const sim = makeSim(fixture);
  const hashes = [hashSnapshot(sim.snapshot())];
  for (let t = 0; t < ticks; t++) {
    sim.step(source.poll(t));
    hashes.push(hashSnapshot(sim.snapshot()));
  }
  return hashes;
}

/** Drives the simulation by frame deltas through the fixed-step clock, like GameRuntime does. */
export function hashRunFramed(
  fixture: Fixture,
  source: IntentSource,
  ticks: number,
  nextDelta: () => number,
): string[] {
  const sim = makeSim(fixture);
  const clock = new FixedStepClock({ dt: SIM_DT, ...fixture.tuning.clock });
  const hashes = [hashSnapshot(sim.snapshot())];
  while (hashes.length <= ticks) {
    const { steps } = clock.advance(nextDelta());
    for (let i = 0; i < steps; i++) {
      sim.step(source.poll(sim.snapshot().tick));
      hashes.push(hashSnapshot(sim.snapshot()));
    }
  }
  return hashes.slice(0, ticks + 1);
}

/** What a replay run reports: the full per-tick hash list is large, so keep a digest too. */
export interface ReplayDigest {
  readonly final: string;
  /** Hash at every 60th tick (one per simulated second), including tick 0 and the last tick. */
  readonly perSecond: string[];
  /** Hash of the concatenated per-tick hashes, so any divergence anywhere shows up. */
  readonly all: string;
}

export function digestHashes(hashes: readonly string[]): ReplayDigest {
  const perSecond: string[] = [];
  hashes.forEach((h, i) => {
    if (i % 60 === 0) perSecond.push(h);
  });
  let h = 0x811c9dc5;
  for (const ch of hashes.join('')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return {
    final: hashes[hashes.length - 1] ?? '',
    perSecond,
    all: (h >>> 0).toString(16).padStart(8, '0'),
  };
}

export function runReplay(fixture: Fixture, replay: Replay): ReplayDigest {
  return digestHashes(hashRunDirect(fixture, new ReplayIntentSource(replay), replay.ticks));
}

export interface HarnessResult {
  /** Encoded replays, recorded in this very environment. */
  readonly encoded: { readonly main: string; readonly moving: string };
  /** Digests from replaying the decoded payloads through direct stepping. */
  readonly direct: { readonly main: ReplayDigest; readonly moving: ReplayDigest };
  /** Digests of the same replays driven through the frame clock with jittery frame deltas. */
  readonly framed: { readonly main: ReplayDigest; readonly moving: ReplayDigest };
}

/**
 * Records both scripted runs, round-trips them through the codec and replays them. Runs identically
 * in Node and in every browser; the e2e spec compares the results (GMR-29).
 */
export function runHarness(levelJson: unknown, tuningJson: unknown): HarnessResult {
  const jobs = [
    { fixture: makeFixture(levelJson, tuningJson), replay: recordMainRun },
    { fixture: movingAnchorFixture(levelJson, tuningJson), replay: recordMovingAnchorRun },
  ] as const;
  const [main, moving] = jobs.map(({ fixture, replay }) => {
    const encoded = encodeReplay(replay(fixture));
    const decoded = decodeReplay(encoded, HARNESS_BUILD).replay;
    const jitter = new SeededRng(99);
    return {
      encoded,
      direct: runReplay(fixture, decoded),
      framed: digestHashes(
        hashRunFramed(
          fixture,
          new ReplayIntentSource(decoded),
          decoded.ticks,
          () => 0.004 + jitter.next() * 0.04,
        ),
      ),
    };
  }) as [
    { encoded: string; direct: ReplayDigest; framed: ReplayDigest },
    { encoded: string; direct: ReplayDigest; framed: ReplayDigest },
  ];
  return {
    encoded: { main: main.encoded, moving: moving.encoded },
    direct: { main: main.direct, moving: moving.direct },
    framed: { main: main.framed, moving: moving.framed },
  };
}

// --- scripted recordings ---------------------------------------------------------------------

/**
 * A scripted player that reacts to the simulation, the way a human would, so the recording holds
 * realistic inputs. It only reads snapshots; the recording captures what it sent.
 */
type Bot = (snap: SimSnapshot, tick: number) => Intent[];

function record(fixture: Fixture, bot: Bot, ticks: number, seed: number): Replay {
  const sim = makeSim(fixture);
  const source = new RecordingIntentSource({
    poll: (tick) => bot(sim.snapshot(), tick),
  });
  for (let t = 0; t < ticks; t++) sim.step(source.poll(t));
  return source.finish({ build: HARNESS_BUILD, level: fixture.level.id, seed, ticks });
}

const A_FIRST = vec2(13.5, 2);

/**
 * Run right, jump, tether to a-first in the air, swing, release, fall into the lethal floor
 * (death), restart, and repeat the first jump.
 */
export function recordMainRun(fixture: Fixture): Replay {
  let phase = 'run';
  let phaseTick = 0;
  let deaths = 0;
  const go = (p: string, tick: number): void => {
    phase = p;
    phaseTick = tick;
  };
  const bot: Bot = (s, tick) => {
    const out: Intent[] = [];
    if (s.deaths > deaths) {
      deaths = s.deaths;
      go('afterDeath', tick);
    }
    switch (phase) {
      case 'run':
        if (tick === 0) out.push({ type: 'move', axis: 1 });
        if (s.player.mode === 'grounded' && s.player.position.x > 4) {
          out.push({ type: 'jumpPress' });
          go('jumping', tick);
        }
        break;
      case 'jumping':
        if (tick - phaseTick === 16) out.push({ type: 'jumpRelease' });
        if (s.player.mode === 'grounded' && tick - phaseTick > 20) {
          out.push({ type: 'jumpPress' }); // blocked by a step: jump again, like a player would
          go('jumping', tick);
        }
        if (s.player.mode === 'air' && s.player.position.x > 8) {
          out.push({ type: 'ropeAim', target: A_FIRST });
          go('aiming', tick);
        }
        break;
      case 'aiming':
        if (s.target?.valid) {
          out.push({ type: 'ropePress' });
          go('swing', tick);
        }
        break;
      case 'swing':
        if (s.player.position.x > A_FIRST.x + 1 && s.player.velocity.x > 2) {
          out.push({ type: 'ropeRelease' });
          go('fall', tick);
        }
        break;
      case 'afterDeath':
        if (tick - phaseTick === 30) {
          out.push({ type: 'restart' });
          go('run', tick);
        }
        break;
      default:
        break;
    }
    return out;
  };
  return record(fixture, bot, 600, 1);
}

const MOVING_ANCHOR = 3;

/** lab-01 with the spawn moved onto pillar-3, next to the moving anchor a-moving. */
export function movingAnchorFixture(levelJson: unknown, tuningJson: unknown): Fixture {
  return makeFixture({ ...(levelJson as object), spawn: [32.4, 5.6] }, tuningJson);
}

/** Run off pillar-3, jump, tether to the moving anchor, ride it, release and fall. */
export function recordMovingAnchorRun(fixture: Fixture): Replay {
  let phase = 'run';
  let phaseTick = 0;
  const go = (p: string, tick: number): void => {
    phase = p;
    phaseTick = tick;
  };
  const bot: Bot = (s, tick) => {
    const out: Intent[] = [];
    switch (phase) {
      case 'run':
        if (tick === 0) out.push({ type: 'move', axis: 1 });
        if (s.player.mode === 'grounded' && s.player.position.x > 33.2) {
          out.push({ type: 'jumpPress' });
          go('jumping', tick);
        }
        break;
      case 'jumping': {
        if (tick - phaseTick === 12) out.push({ type: 'jumpRelease' });
        const a = s.anchors[MOVING_ANCHOR];
        if (a && s.player.mode === 'air' && tick - phaseTick > 6) {
          out.push({ type: 'ropeAim', target: a });
          if (s.target?.valid) {
            out.push({ type: 'ropePress' });
            go('swing', tick);
          }
        }
        break;
      }
      case 'swing':
        if (tick - phaseTick === 90) {
          out.push({ type: 'ropeRelease' }, { type: 'move', axis: 0 });
          go('fall', tick);
        }
        break;
      default:
        break;
    }
    return out;
  };
  return record(fixture, bot, 600, 2);
}
