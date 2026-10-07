import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { LevelError, parseLevel } from './level';
import { parseRuntimeTuning, TuningError } from './tuning';

describe('parseRuntimeTuning', () => {
  it('accepts the shipped runtime tuning', () => {
    const tuning = parseRuntimeTuning(runtimeJson);
    expect(tuning.clock.maxStepsPerFrame).toBe(5);
    expect(tuning.sim.player.runSpeed).toBeGreaterThan(0);
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

describe('parseLevel', () => {
  it('accepts the movement lab', () => {
    const level = parseLevel(lab01);
    expect(level.solids.length).toBeGreaterThan(5);
    expect(level.anchors.some((a) => a.path)).toBe(true);
  });

  it('rejects duplicate ids and bad shapes with a path', () => {
    const dup = structuredClone(lab01) as { solids: { id: string }[] };
    (dup.solids[1] as { id: string }).id = (dup.solids[0] as { id: string }).id;
    expect(() => parseLevel(dup)).toThrow(LevelError);
    const bad = structuredClone(lab01) as { solids: unknown[] };
    bad.solids[0] = { id: 'x', rect: { x: 0, y: 0, w: -1, h: 1 } };
    expect(() => parseLevel(bad)).toThrow('level.solids[0].rect');
  });
});
