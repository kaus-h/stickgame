import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runHarness } from '../../src/tools/replay-drift/scenario';
import { digestOf } from '../../src/tools/device-lab/determinism';
import { GOLDEN } from '../../src/tools/device-lab/golden';
import { FrameStats, heapGrowthMb, samplePercentile } from '../../src/tools/device-lab/stats';
import { evaluate, type EvaluationInput } from '../../src/tools/device-lab/thresholds';

const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('device lab (GMR-33)', () => {
  it('the golden replay hashes match this build', () => {
    const r = runHarness(json('content/levels/lab-01.json'), json('content/tuning/runtime.json'));
    expect(digestOf(r)).toEqual(GOLDEN);
  });

  it('frame stats: percentiles, long-frame counts and windowed fps', () => {
    const s = new FrameStats(1000);
    let now = 0;
    for (let i = 0; i < 990; i++) {
      now += 16.7;
      s.record(now, 16.7);
    }
    for (let i = 0; i < 10; i++) {
      now += 40;
      s.record(now, 40);
    }
    const sum = s.summary();
    expect(sum.frames).toBe(1000);
    expect(sum.over33Ms).toBe(10);
    expect(sum.over33Pct).toBeCloseTo(1, 5);
    expect(sum.p50Ms).toBeGreaterThanOrEqual(16.7);
    expect(sum.p50Ms).toBeLessThan(17.2);
    expect(sum.p99Ms).toBeLessThan(17.2); // 1 % long frames: p99 still sits in the 16.7 bucket
    expect(sum.maxMs).toBe(40);
    expect(sum.windowFps.length).toBeGreaterThan(0);
    expect(sum.refreshHzEstimate).toBe(60);
  });

  it('stalls (backgrounded) are counted, not folded into the histogram', () => {
    const s = new FrameStats();
    s.record(16, 16);
    s.record(5016, 5000);
    const sum = s.summary();
    expect(sum.frames).toBe(1);
    expect(sum.stalls).toBe(1);
  });

  it('nearest-rank percentile and heap growth', () => {
    expect(samplePercentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(samplePercentile([], 95)).toBe(0);
    expect(
      heapGrowthMb([
        { t: 10, usedMb: 5 },
        { t: 70, usedMb: 20 },
        { t: 900, usedMb: 24 },
      ]),
    ).toBe(4);
    expect(heapGrowthMb([{ t: 10, usedMb: 5 }])).toBeNull();
  });

  it('evaluate applies per-platform audio limits and marks missing data n/a', () => {
    const s = new FrameStats();
    for (let i = 1; i <= 100; i++) s.record(i * 16.7, 16.7);
    const base: EvaluationInput = {
      platform: 'ios',
      frames: s.summary(),
      touchLatenciesMs: [20, 22, 25, 30, 35],
      memory: [],
      audioClickLatencyMs: 45,
      audioRecoveryMs: null,
      webglRestoreMs: null,
      deterministic: true,
      runSeconds: 900,
      targetSeconds: 900,
    };
    const byId = (i: EvaluationInput): Record<string, string> =>
      Object.fromEntries(evaluate(i).map((c) => [c.id, c.verdict]));
    expect(byId(base)['audio-latency']).toBe('fail'); // 45 ms > 30 ms on iOS
    expect(byId({ ...base, platform: 'android' })['audio-latency']).toBe('pass');
    expect(byId(base)['audio-recovery']).toBe('n/a');
    expect(byId(base)['touch-p95']).toBe('pass');
    expect(byId(base)['frame-p99']).toBe('pass');
    expect(byId({ ...base, deterministic: false }).determinism).toBe('fail');
    expect(byId({ ...base, runSeconds: 30 })['run-complete']).toBe('n/a');
  });
});
