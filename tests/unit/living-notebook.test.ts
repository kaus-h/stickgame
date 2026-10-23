import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import type { SimSnapshot } from '../../src/sim';
import { DUST_MIN_SPEED, InkJuice, ROPE_DRAW_ON } from '../../src/render/living/inkJuice';
import { coveredSpans, poolShape, rippleAt, surfaceOffset } from '../../src/render/living/inkPool';
import {
  BOIL_DRAWINGS,
  BOIL_FPS,
  boilDrawing,
  boilNoise,
  writeBoilField,
} from '../../src/render/living/lineBoil';

describe('line boil', () => {
  it('cycles three drawings at 8 fps', () => {
    const seen = [0, 1, 2, 3, 4, 5].map((i) => boilDrawing(i / BOIL_FPS + 0.01));
    expect(seen).toEqual([0, 1, 2, 0, 1, 2]);
    expect(BOIL_DRAWINGS).toBe(3);
  });
  it('holds one drawing between steps (no shimmer at 60 fps)', () => {
    const a = boilDrawing(1.0);
    for (let k = 1; k < 7; k++) expect(boilDrawing(1.0 + k / 60)).toBe(a);
  });
  it('is world-locked: the same world point gets the same offset as the camera moves', () => {
    const w = 8;
    const h = 4;
    const view = { x: 100, y: 50, width: 80, height: 40 };
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);
    writeBoilField(a, w, h, view, 1);
    writeBoilField(b, w, h, { ...view, x: view.x + view.width / w }, 1); // one texel right
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w - 1; i++) expect(b[(j * w + i) * 4]).toBe(a[(j * w + i + 1) * 4]);
  });
  it('stays in 0..1 and differs between drawings', () => {
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const v = boilNoise(i * 7.3, i * 3.1, 0, 0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      diff += Math.abs(v - boilNoise(i * 7.3, i * 3.1, 1, 0));
    }
    expect(diff).toBeGreaterThan(1);
  });
});

const snap = (rope = false): SimSnapshot =>
  ({
    player: { position: vec2(2, 3), velocity: vec2(6, 0) },
    rope: rope ? { point: vec2(5, 0) } : null,
  }) as unknown as SimSnapshot;

describe('ink juice', () => {
  it('dusts hard landings only, and marks fade out', () => {
    const j = new InkJuice();
    j.onEvents([{ type: 'land', tick: 1, speed: DUST_MIN_SPEED - 0.5 }]);
    j.update(1 / 60, snap(), false);
    expect(j.active).toHaveLength(0);
    j.onEvents([{ type: 'land', tick: 2, speed: 12 }]);
    j.update(1 / 60, snap(), false);
    expect(j.active.filter((k) => k.kind === 'dust')).toHaveLength(2);
    for (let i = 0; i < 40; i++) j.update(1 / 60, snap(), false);
    expect(j.active).toHaveLength(0);
  });
  it('draws the rope on quickly after it bites, and instantly under reduced motion', () => {
    const j = new InkJuice();
    j.onEvents([{ type: 'ropeAttach', tick: 3, anchor: 0, length: 4 }]);
    j.update(0, snap(true), false);
    expect(j.active.some((k) => k.kind === 'blot')).toBe(true);
    expect(j.ropeDrawn(false)).toBe(0);
    expect(j.ropeDrawn(true)).toBe(1);
    j.update(ROPE_DRAW_ON, snap(true), false);
    expect(j.ropeDrawn(false)).toBe(1);
  });
  it('a reset clears every mark (death never waits on effects)', () => {
    const j = new InkJuice();
    j.onEvents([{ type: 'jump', tick: 4 }]);
    j.update(1 / 60, snap(), false);
    expect(j.active.length).toBeGreaterThan(0);
    j.onEvents([{ type: 'reset', tick: 5 }]);
    j.update(1 / 60, snap(), false);
    expect(j.active).toHaveLength(0);
  });
});

describe('ink pools', () => {
  it('ripples stay within a few centimetres of the authored surface', () => {
    for (let i = 0; i < 200; i++) {
      expect(Math.abs(rippleAt(i * 0.37, i * 0.11, 17))).toBeLessThan(0.06);
      // The inked surface never rises visibly above the lethal top, and never sinks far below it.
      const drawn = surfaceOffset(i * 0.37, i * 0.11, 17);
      expect(drawn).toBeGreaterThan(-0.01);
      expect(drawn).toBeLessThan(0.1);
    }
  });
  it('joins a pool resting in the red floor: the floor has no surface under it', () => {
    const floor = { minX: 0, maxX: 40, top: 11.4, bottom: 13, seed: 1 };
    const basin = { minX: 10, maxX: 22, top: 7.8, bottom: 11.4, seed: 2 };
    const beside = { minX: 30, maxX: 34, top: 9, bottom: 11.4, seed: 3 };
    const apart = { minX: 50, maxX: 60, top: 5, bottom: 11.4, seed: 4 };
    const all = [floor, basin, beside, apart];
    expect(coveredSpans(floor, all)).toEqual([
      [10, 22],
      [30, 34],
    ]);
    expect(coveredSpans(basin, all)).toEqual([]);
  });
  it('reads the pool rectangle from its collision polygon', () => {
    const shape = poolShape({
      id: 'pool-a',
      kind: 'hazard',
      points: [vec2(0, 5), vec2(10, 5), vec2(10, 7), vec2(0, 7)],
    } as never);
    expect(shape).toMatchObject({ minX: 0, maxX: 10, top: 5, bottom: 7 });
  });
});
