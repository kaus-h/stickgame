import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { GameRuntime } from '../../src/app/runtime/GameRuntime';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import { SeededRng, type Intent, type IntentSource } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import {
  MockPlatformServices,
  NullPlatformServices,
  type PlatformServices,
} from '../../src/platform';
import { Simulation, type SimSnapshot } from '../../src/sim';

const tuning = parseRuntimeTuning(runtimeJson);
const level = parseLevel(lab01);

/** Intents keyed by tick, like a replay: independent of frame timing. */
const script: IntentSource = {
  poll(tick: number): readonly Intent[] {
    if (tick === 5) return [{ type: 'move', axis: 1 }];
    if (tick === 60) return [{ type: 'jumpPress' }];
    if (tick === 75) return [{ type: 'jumpRelease' }];
    if (tick === 120) return [{ type: 'move', axis: -1 }];
    if (tick === 200) return [{ type: 'move', axis: 0 }];
    return [];
  },
};

function makeRuntime(
  platform: PlatformServices = new NullPlatformServices(),
  intents: IntentSource = script,
) {
  return new GameRuntime({
    tuning,
    level,
    physics: new KinematicPhysicsAdapter(),
    intents,
    platform,
    now: () => 0,
  });
}

function runFor(ticks: number, nextDelta: () => number): SimSnapshot {
  const runtime = makeRuntime();
  while (runtime.sim.snapshot().tick < ticks) runtime.frame(nextDelta());
  return runtime.sim.snapshot();
}

function referenceAt(ticks: number): SimSnapshot {
  const sim = new Simulation(tuning.sim, new KinematicPhysicsAdapter(), level);
  for (let i = 0; i < ticks; i++) sim.step(script.poll(sim.snapshot().tick));
  return sim.snapshot();
}

describe('GameRuntime timing policy', () => {
  it('produces identical gameplay at 30, 60, 144 Hz and under jittery frame times', () => {
    const jitter = new SeededRng(1234);
    const patterns: Record<string, () => number> = {
      '30 Hz': () => 1 / 30,
      '60 Hz': () => 1 / 60,
      '144 Hz': () => 1 / 144,
      jitter: () => 0.004 + jitter.next() * 0.04,
    };
    for (const [name, delta] of Object.entries(patterns)) {
      const state = runFor(600, delta);
      expect(state, name).toEqual(referenceAt(state.tick));
    }
  });

  it('interpolation alpha stays in [0, 1)', () => {
    const runtime = makeRuntime();
    for (let i = 0; i < 500; i++) {
      const { alpha } = runtime.frame(0.007);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('does not accumulate state across 1,000 restarts', () => {
    let pendingRestart = false;
    const intents: IntentSource = {
      poll: () => {
        if (!pendingRestart) return [];
        pendingRestart = false;
        return [{ type: 'restart' }];
      },
    };
    const runtime = makeRuntime(new NullPlatformServices(), intents);
    const unsubscribe = runtime.onEvents(() => {});
    runtime.frame(1 / 60);
    const baseline = runtime.stats();
    const listeners = runtime.listenerCount;
    for (let i = 0; i < 1000; i++) {
      for (let f = 0; f < 5; f++) runtime.frame(1 / 60);
      pendingRestart = true;
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
    const platform = new MockPlatformServices();
    const notify = (visible: boolean): void => {
      platform.setVisible(visible);
    };
    const runtime = makeRuntime(platform);
    runtime.frame(1 / 60);
    notify(false);
    const tickBefore = runtime.sim.snapshot().tick;
    runtime.frame(5);
    expect(runtime.sim.snapshot().tick).toBe(tickBefore);
    notify(true);
    expect(runtime.frame(1 / 60).stats.stepsLastFrame).toBe(1);
  });
});
