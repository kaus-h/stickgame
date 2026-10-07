import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning, TuningError } from './tuning';

describe('parseRuntimeTuning', () => {
  it('accepts the shipped runtime tuning', () => {
    const tuning = parseRuntimeTuning(runtimeJson);
    expect(tuning.clock.maxStepsPerFrame).toBe(5);
    expect(tuning.sim.probe.bounds.floorY).toBe(8);
  });

  it('names the offending path for invalid values', () => {
    const bad = structuredClone(runtimeJson) as { sim: { gravity: unknown } };
    bad.sim.gravity = 'heavy';
    expect(() => parseRuntimeTuning(bad)).toThrow(TuningError);
    expect(() => parseRuntimeTuning(bad)).toThrow('tuning.sim.gravity');
  });

  it('rejects a step cap below one', () => {
    const bad = structuredClone(runtimeJson);
    bad.clock.maxStepsPerFrame = 0;
    expect(() => parseRuntimeTuning(bad)).toThrow('tuning.clock.maxStepsPerFrame');
  });
});
