import { describe, expect, it } from 'vitest';
import { vec2, type Vec2 } from '../../src/core';
import { STANDARD_ASSIST, type RopeTuning } from '../../src/sim';
import {
  AcquisitionSession,
  generateTrials,
  type LabConfig,
} from '../../src/tools/touch-lab/session';

const rope: RopeTuning = {
  minLength: 0,
  maxLength: Number.MAX_VALUE,
  selectRadius: 1.1,
  steerAccel: 6,
  steerEnergyHeight: 0.6,
  catchRetention: 1,
};
const config = (over: Partial<LabConfig> = {}): LabConfig => ({
  scheme: 'direct-touch',
  moveStyle: 'digital',
  assist: STANDARD_ASSIST,
  rope,
  anchorRadius: 0.4,
  pxPerM: 32,
  occlusionPx: 24,
  timeoutMs: 6000,
  worldToScreen: (p: Vec2) => vec2(p.x * 32, p.y * 32),
  ...over,
});
const area = { x0: 0, y0: 0, x1: 20, y1: 8 };

describe('touch lab trials', () => {
  it('are seeded: same seed, same targets; avoid zones and separation respected', () => {
    const avoid = (p: Vec2) => p.x < 4 && p.y > 4;
    const a = generateTrials(27, 30, area, avoid);
    expect(generateTrials(27, 30, area, avoid)).toEqual(a);
    expect(generateTrials(28, 30, area, avoid)).not.toEqual(a);
    for (const t of a) {
      expect(avoid(t.target)).toBe(false);
      expect(t.decoys).toHaveLength(2);
      for (const d of t.decoys)
        expect(Math.hypot(d.x - t.target.x, d.y - t.target.y)).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('records acquisition time, misses, error and occlusion per trial', () => {
    const specs = [{ target: vec2(10, 3), decoys: [vec2(15, 3)] }];
    const s = new AcquisitionSession(config(), specs, vec2(2, 7));
    expect(s.begin(1000)).toBe(true);
    // A miss in empty space, with a finger elsewhere.
    s.press(1400, vec2(6, 6), [{ x: 6 * 32, y: 6 * 32, role: 'rope' }]);
    // A hit with the finger on the target (direct touch covers it) while holding move.
    const hit = s.press(1900, vec2(10.1, 3), [
      { x: 10.1 * 32, y: 3 * 32, role: 'rope' },
      { x: 50, y: 300, role: 'move' },
    ]);
    expect(hit).toMatchObject({ selected: 'target', occluded: true, moveHeld: true });
    expect(s.done).toBe(true);
    const [trial] = s.results();
    expect(trial).toMatchObject({ acquisitionMs: 900, misses: 1, timedOut: false });
    const sum = s.summary();
    expect(sum).toMatchObject({ trials: 1, acquired: 1, presses: 2, misses: 1, missRate: 0.5 });
    expect(sum.occlusionRate).toBe(0.5);
    expect(sum.overlapRate).toBe(0.5);
    expect(sum.meanErrorPx).toBeCloseTo(sum.meanErrorM !== null ? sum.meanErrorM * 32 : NaN, 9);
  });

  it('counts a decoy selection as a miss and times out unacquired trials', () => {
    const specs = [
      { target: vec2(10, 3), decoys: [vec2(15, 3)] },
      { target: vec2(5, 3), decoys: [] },
    ];
    const s = new AcquisitionSession(config({ timeoutMs: 1000 }), specs, vec2(2, 7));
    s.begin(0);
    expect(s.press(100, vec2(15, 3), [])?.selected).toBe('decoy');
    s.tick(999);
    expect(s.active).not.toBeNull();
    s.tick(1000);
    expect(s.active).toBeNull();
    s.begin(2000);
    s.press(2500, vec2(5, 3), []);
    expect(s.done).toBe(true);
    expect(s.summary()).toMatchObject({
      trials: 2,
      acquired: 1,
      timeouts: 1,
      medianAcquisitionMs: 500,
    });
  });

  it('uses the chosen assist tier: snap acquires from 2 m out and is reported', () => {
    const specs = [{ target: vec2(10, 3), decoys: [] }];
    const snap = new AcquisitionSession(
      config({ assist: { mode: 'snap', wideSelectRadius: 1.8, snapRadius: 2.6 } }),
      specs,
      vec2(2, 7),
    );
    snap.begin(0);
    expect(snap.press(10, vec2(12.4, 3), [])).toMatchObject({ selected: 'target', snapped: true });
    const std = new AcquisitionSession(config(), specs, vec2(2, 7));
    std.begin(0);
    expect(std.press(10, vec2(12.4, 3), [])).toMatchObject({ selected: 'none', snapped: false });
  });
});
