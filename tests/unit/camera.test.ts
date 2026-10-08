import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../src/content';
import { vec2 } from '../../src/core';
import {
  cameraScale,
  cameraTarget,
  clampToBounds,
  DEFAULT_CAMERA,
  stepCamera,
} from '../../src/render/camera';

const rope = parseRuntimeTuning(runtimeJson).sim.rope;
/** Common browser and phone viewports (CSS px), landscape. */
const VIEWPORTS: Record<string, [number, number]> = {
  '4:3 iPad': [1024, 768],
  '16:10 laptop': [1440, 900],
  '16:9 1080p': [1920, 1080],
  '19.5:9 iPhone': [844, 390],
  '20:9 Android': [800, 360],
  '21:9 ultrawide': [2560, 1080],
  '32:9 super-ultrawide': [3840, 1080],
};

describe('camera framing (GMR-25)', () => {
  it('keeps every anchor within full rope range ahead or behind on screen at any aspect', () => {
    const reach = rope.maxLength + 0.4;
    for (const [name, [w, h]] of Object.entries(VIEWPORTS)) {
      const ppm = cameraScale(w, h, DEFAULT_CAMERA);
      const halfWidth = w / ppm / 2;
      expect(halfWidth, name).toBeGreaterThanOrEqual(reach);
      // And at least ~12 m of height, so vertical framing is comparable across devices.
      expect(h / ppm, name).toBeGreaterThanOrEqual(DEFAULT_CAMERA.viewHeight - 1e-9);
    }
  });

  it('zoom depends only on the viewport, never on motion', () => {
    expect(cameraScale(1920, 1080, DEFAULT_CAMERA)).toBe(cameraScale(1920, 1080, DEFAULT_CAMERA));
    expect(cameraScale(1920, 1080, DEFAULT_CAMERA)).toBeCloseTo(1920 / 23, 9);
  });

  it('looks ahead in the direction of travel, capped', () => {
    expect(cameraTarget(vec2(0, 0), vec2(0, 0), DEFAULT_CAMERA)).toEqual(vec2(0, -1));
    expect(cameraTarget(vec2(0, 0), vec2(7.5, 0), DEFAULT_CAMERA).x).toBeCloseTo(2.625, 9);
    expect(cameraTarget(vec2(0, 0), vec2(-40, 0), DEFAULT_CAMERA).x).toBe(-3);
    expect(cameraTarget(vec2(0, 0), vec2(0, 40), DEFAULT_CAMERA).y).toBe(1);
  });

  it('eases toward the target and snaps on reset', () => {
    let c = vec2(0, 0);
    for (let i = 0; i < 120; i++) c = stepCamera(c, vec2(10, 0), 1 / 60, DEFAULT_CAMERA, false);
    expect(c.x).toBeGreaterThan(9.9);
    expect(stepCamera(vec2(0, 0), vec2(5, 5), 1 / 60, DEFAULT_CAMERA, true)).toEqual(vec2(5, 5));
  });

  it('clamps to level bounds and centers levels smaller than the view', () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 10 };
    expect(clampToBounds(vec2(2, 5), 20, 12, b)).toEqual(vec2(10, 5));
    expect(clampToBounds(vec2(99, 5), 20, 12, b).x).toBe(90);
  });
});
