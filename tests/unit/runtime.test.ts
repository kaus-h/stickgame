import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { GameRuntime } from '../../src/app/runtime/GameRuntime';
import { parseRuntimeTuning } from '../../src/content';
import { SeededRng } from '../../src/core';
import { IntentQueue } from '../../src/input';
import { NullPhysicsAdapter } from '../../src/physics/backends/null/NullPhysicsAdapter';
import { NullPlatformServices, type PlatformServices } from '../../src/platform';
import { Simulation, type SimSnapshot } from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson);

function makeRuntime(platform: PlatformServices = new NullPlatformServices()) {
  const intents = new IntentQueue();
  const runtime = new GameRuntime({
    tuning,
    physics: new NullPhysicsAdapter(),
    intents,
    platform,
    now: () => 0,
  });
  return { runtime, intents };
}

/** Drive the runtime with a frame-time pattern until at least `ticks` steps have run. */
function runFor(ticks: number, nextDelta: () => number): SimSnapshot {
  const { runtime } = makeRuntime();
  while (runtime.sim.snapshot().tick < ticks) runtime.frame(nextDelta());
  return runtime.sim.snapshot();
}

/** The same number of fixed steps with no frame timing involved at all. */
function referenceAt(ticks: number): SimSnapshot {
  const sim = new Simulation(tuning.sim, new NullPhysicsAdapter());
  for (let i = 0; i < ticks; i++) sim.step([]);
  return sim.snapshot();
}

describe('GameRuntime timing policy', () => {
  it('produces identical simulation states at 30, 60, 144 Hz and under jittery frame times', () => {
    const jitter = new SeededRng(1234);
    const patterns: Record<string, () => number> = {
      '30 Hz': () => 1 / 30,
      '60 Hz': () => 1 / 60,
      '144 Hz': () => 1 / 144,
      jitter: () => 0.004 + jitter.next() * 0.04,
    };

    for (const [name, delta] of Object.entries(patterns)) {
      const state = runFor(600, delta); // 10 simulated seconds
      expect(state, name).toEqual(referenceAt(state.tick));
    }
  });

  it('interpolation alpha stays in [0, 1)', () => {
    const { runtime } = makeRuntime();
    for (let i = 0; i < 500; i++) {
      const { alpha } = runtime.frame(0.007);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('does not accumulate state across 1,000 resets', () => {
    const { runtime, intents } = makeRuntime();
    const unsubscribe = runtime.onEvents(() => {});
    runtime.frame(1 / 60);
    const baseline = runtime.stats();
    const listeners = runtime.listenerCount;

    for (let i = 0; i < 1000; i++) {
      for (let f = 0; f < 5; f++) runtime.frame(1 / 60);
      intents.push({ type: 'restart' });
      runtime.frame(1 / 60);
    }

    const after = runtime.stats();
    expect(after.resets).toBe(1000);
    expect(after.entities).toBe(baseline.entities);
    expect(after.bodies).toBe(baseline.bodies);
    expect(after.joints).toBe(baseline.joints);
    expect(runtime.listenerCount).toBe(listeners);
    expect(runtime.sim.stats().pendingEvents).toBe(0);
    unsubscribe();
  });

  it('pauses on visibility loss without bursting catch-up steps on resume', () => {
    let notify: (visible: boolean) => void = () => {};
    const platform: PlatformServices = {
      name: 'test',
      onVisibilityChange: (listener) => {
        notify = listener;
        return () => {};
      },
    };
    const { runtime } = makeRuntime(platform);
    runtime.frame(1 / 60);
    notify(false);
    const tickBefore = runtime.sim.snapshot().tick;
    runtime.frame(5);
    expect(runtime.sim.snapshot().tick).toBe(tickBefore);
    notify(true);
    expect(runtime.frame(1 / 60).stats.stepsLastFrame).toBe(1);
  });
});
