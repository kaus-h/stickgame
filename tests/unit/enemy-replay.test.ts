import { expect, it } from 'vitest';
import drop from '../../content/levels/lab-goon-drop.json';
import tuning from '../../content/tuning/runtime.json';
import {
  decodeReplay,
  encodeReplay,
  ReplayIntentSource,
  SeededRng,
  type Replay,
} from '../../src/core';
import {
  makeFixture,
  makeSim,
  hashRunDirect,
  hashRunFramed,
} from '../../src/tools/replay-drift/scenario';

const fixture = makeFixture(drop, tuning);
const replay: Replay = {
  version: 1,
  build: 'goon-harness',
  level: drop.id,
  seed: 45,
  ticks: 130,
  inputs: [
    { tick: 0, intents: [{ type: 'move', axis: 1 }] },
    { tick: 57, intents: [{ type: 'ropeAim', target: { x: 11, y: 2 } }, { type: 'ropePress' }] },
    { tick: 67, intents: [{ type: 'ropeRelease' }] },
    { tick: 120, intents: [{ type: 'restart' }] },
  ],
};

it('the recorded enemy route exercises stomp, attach, release and restoration', () => {
  const sim = makeSim(fixture);
  const source = new ReplayIntentSource(replay);
  const types = new Set<string>();
  for (let tick = 0; tick < replay.ticks; tick++) {
    sim.step(source.poll(tick));
    for (const event of sim.drainEvents()) types.add(event.type);
  }
  for (const type of ['stomp', 'ropeAttach', 'ropeRelease', 'reset'])
    expect(types.has(type), type).toBe(true);
  expect(sim.snapshot().deaths).toBe(0);
  expect(sim.snapshot().enemies[0]?.alive).toBe(true);
  sim.dispose();
});

it('enemy state and rebound replay identically at 30/60/144 Hz, jitter and encode/decode', () => {
  const decoded = decodeReplay(encodeReplay(replay), replay.build).replay;
  const reference = hashRunDirect(fixture, new ReplayIntentSource(replay), replay.ticks);
  const rng = new SeededRng(45);
  for (const delta of [() => 1 / 30, () => 1 / 60, () => 1 / 144, () => 0.003 + rng.next() * 0.045])
    expect(hashRunFramed(fixture, new ReplayIntentSource(decoded), replay.ticks, delta)).toEqual(
      reference,
    );
});
