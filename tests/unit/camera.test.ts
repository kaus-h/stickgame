import { describe, expect, it } from 'vitest';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../src/content';
import { vec2 } from '../../src/core';
import {
  ATTENTION_FLOOR,
  ATTENTION_MARGIN,
  attentionTarget,
  CALM_CAMERA,
  cameraScale,
  cameraTarget,
  clampToBounds,
  DEFAULT_CAMERA,
  framedAnchors,
  stepCamera,
  sightBlocked,
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
    expect(cameraTarget(vec2(0, 0), vec2(0, 0), DEFAULT_CAMERA)).toEqual(
      vec2(0, DEFAULT_CAMERA.verticalBias),
    );
    expect(cameraTarget(vec2(0, 0), vec2(7.5, 0), DEFAULT_CAMERA).x).toBeCloseTo(2.625, 9);
    expect(cameraTarget(vec2(0, 0), vec2(-40, 0), DEFAULT_CAMERA).x).toBe(-3);
    expect(cameraTarget(vec2(0, 0), vec2(0, 40), DEFAULT_CAMERA).y).toBe(
      2 + DEFAULT_CAMERA.verticalBias,
    );
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

describe('anchor attention (GMR-44)', () => {
  const view = { w: 28, h: 12 };
  const anchor = (x: number, y: number) => {
    const [a] = framedAnchors([{ position: { x, y }, radius: 0.4 }]);
    if (!a) throw new Error('no anchor');
    return a;
  };
  it('lifts the view to show a reachable anchor above the frame', () => {
    const player = { x: 0, y: 8 };
    const base = cameraTarget(player, { x: 0, y: 0 }, DEFAULT_CAMERA); // y = 7
    const t = attentionTarget(base, player, { x: 0, y: 0 }, [anchor(5, 0)], view.w, view.h, 11);
    expect(t.y - view.h / 2).toBeLessThanOrEqual(0 - 0.4 - ATTENTION_MARGIN + 1e-9);
    expect(t.y + view.h / 2).toBeGreaterThanOrEqual(player.y + ATTENTION_FLOOR - 1e-9);
  });
  it('ignores anchors out of reach and leaves an already-visible frame alone', () => {
    const player = { x: 0, y: 8 };
    const base = cameraTarget(player, { x: 0, y: 0 }, DEFAULT_CAMERA);
    expect(
      attentionTarget(base, player, { x: 0, y: 0 }, [anchor(0, -20)], view.w, view.h, 11),
    ).toEqual(base);
    expect(
      attentionTarget(base, player, { x: 0, y: 0 }, [anchor(3, 4)], view.w, view.h, 11),
    ).toEqual(base);
  });
  it('never lifts so far that the player or a lower anchor in reach leaves the bottom edge', () => {
    const player = { x: 0, y: 8 };
    const base = cameraTarget(player, { x: 0, y: 0 }, DEFAULT_CAMERA);
    const t = attentionTarget(
      base,
      player,
      { x: 0, y: 0 },
      [anchor(4, -4), anchor(6, 9)],
      view.w,
      view.h,
      11,
    );
    expect(t.y + view.h / 2).toBeGreaterThanOrEqual(9 + 0.4 + ATTENTION_MARGIN - 1e-9);
  });
  it('frames the whole path of a moving anchor', () => {
    const [a] = framedAnchors([
      { position: { x: 0, y: 4 }, radius: 0.4, path: { to: { x: 6, y: -0.5 } } },
    ]);
    expect(a).toEqual({ minX: -0.4, maxX: 6.4, top: -0.9, bottom: 4.4 });
  });
  it('reduced motion drops the velocity lookahead only', () => {
    expect(cameraTarget({ x: 0, y: 0 }, { x: 20, y: 10 }, CALM_CAMERA)).toEqual({
      x: 0,
      y: CALM_CAMERA.verticalBias,
    });
  });

  it('does not frame a static anchor hidden behind terrain for the next half second', () => {
    // An anchor above a ceiling slab (1-1 c6's old m6 layout): from below it cannot be roped.
    const ceiling = {
      kind: 'solid',
      points: [vec2(98, -1.6), vec2(122, -1.6), vec2(122, -0.4), vec2(98, -0.4)],
    };
    const anchors = framedAnchors([{ position: vec2(110, -3.6), radius: 0.4 }]);
    const player = vec2(108, 2);
    const target = vec2(108, 3);
    expect(sightBlocked(player, vec2(110, -3.6), [ceiling])).toBe(true);
    expect(sightBlocked(player, vec2(110, -3.6), [{ ...ceiling, kind: 'hazard' }])).toBe(false);
    const hidden = attentionTarget(target, player, vec2(2, 0), anchors, 23, 12.9, 11, 0, [ceiling]);
    expect(hidden).toEqual(target);
    // Without the ceiling the same anchor is in reach and lifts the frame.
    const open = attentionTarget(target, player, vec2(2, 0), anchors, 23, 12.9, 11, 0, []);
    expect(open.y).toBeLessThan(target.y);
    // Rising out past the ceiling's end within half a second: framed early, as before.
    const near = vec2(99, 3);
    expect(sightBlocked(vec2(99, 0.5), vec2(110, -3.6), [ceiling])).toBe(true);
    const leaving = attentionTarget(near, vec2(99, 0.5), vec2(-8, -4), anchors, 23, 12.9, 11, 0, [
      ceiling,
    ]);
    expect(leaving.y).toBeLessThan(near.y);
    // Rising fast straight under the slab (1-1 C6 before the a6b shot): the half-second extrapolation pokes
    // through the ceiling, but the player cannot get there, so the anchor stays unframed.
    const under = vec2(110.3, 1.6);
    const rising = attentionTarget(
      under,
      vec2(110.3, 0.65),
      vec2(1, -7),
      anchors,
      23,
      12.9,
      11,
      0,
      [ceiling],
    );
    expect(rising).toEqual(under);
  });
});
