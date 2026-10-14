import type { RuntimeTuning } from '../../content';
import type { Vec2 } from '../../core';
import {
  attentionTarget,
  cameraScale,
  cameraTarget,
  clampToBounds,
  DEFAULT_CAMERA,
  framedAnchors,
  HUD_BAND_PX,
  stepCamera,
} from '../../render/camera';
import type { LevelDef } from '../../sim';
import { PlanSource, type PlanStep } from './plan';
import { World } from './world';

/**
 * Camera fairness for solver routes (GMR-44, mirrored by tests/unit/camera-fairness.test.ts):
 * every anchor a route ropes was on screen, inside the safe area, for the 0.5 s before the press
 * (or since the attempt began, if shorter), on every tested aspect ratio. Centre attach (GMR-118)
 * changes which routes the search finds, so the search vetoes presses the real camera would hide.
 */
const LEAD_TICKS = 30;
const MARGIN = 0.25;
const VIEWPORTS = [
  { w: 1024, h: 768, inset: 0 },
  { w: 1920, h: 1080, inset: 0 },
  { w: 2532, h: 1170, inset: 141 },
  { w: 2560, h: 1080, inset: 0 },
];

export type CameraFair = (
  steps: readonly PlanStep[],
  until: number,
  lastTickOnly: boolean,
) => boolean;

/** Build the checker: replays `steps` from a fresh world up to tick `until` (exclusive). */
export function makeCameraFair(level: LevelDef, tuning: RuntimeTuning): CameraFair {
  const framed = framedAnchors(level.anchors);
  const views = VIEWPORTS.map((vp) => {
    const scale = cameraScale(vp.w, vp.h, DEFAULT_CAMERA);
    return {
      scale,
      viewW: vp.w / scale,
      viewH: vp.h / scale,
      safeW: (vp.w - 2 * vp.inset) / scale,
    };
  });
  return (steps, until, lastTickOnly) => {
    const world = World.create(level, tuning);
    const source = new PlanSource(steps, level);
    const eased: (Vec2 | null)[] = views.map(() => null);
    const seen = views.map(() => new Map<number, number>());
    let resets = -1;
    let attemptStart = 0;
    while (world.tick < until) {
      const events = world.step(source);
      const s = world.sim.snapshot();
      const reset = s.resets !== resets;
      if (reset) {
        resets = s.resets;
        attemptStart = world.tick;
      }
      for (let v = 0; v < views.length; v++) {
        const view = views[v] as (typeof views)[number];
        const seenV = seen[v] as Map<number, number>;
        if (reset) seenV.clear();
        const target = attentionTarget(
          cameraTarget(s.player.position, s.player.velocity, DEFAULT_CAMERA),
          s.player.position,
          s.player.velocity,
          framed,
          view.viewW,
          view.viewH,
          tuning.sim.rope.maxLength,
          HUD_BAND_PX / view.scale,
          level.solids,
        );
        const prev = eased[v] ?? null;
        const next = stepCamera(
          prev ?? target,
          target,
          1 / 60,
          DEFAULT_CAMERA,
          prev === null || reset,
        );
        eased[v] = next;
        const center = clampToBounds(next, view.viewW, view.viewH, level.bounds);
        s.anchors.forEach((a, i) => {
          const r = level.anchors[i]?.radius ?? 0.4;
          const inside =
            Math.abs(a.x - center.x) <= view.safeW / 2 - r - MARGIN &&
            Math.abs(a.y - center.y) <= view.viewH / 2 - r - MARGIN;
          seenV.set(i, inside ? (seenV.get(i) ?? 0) + 1 : 0);
        });
        if (lastTickOnly && world.tick !== until) continue;
        for (const e of events) {
          if (e.type !== 'ropeAttach') continue;
          const need = Math.min(LEAD_TICKS, world.tick - attemptStart);
          if ((seenV.get(e.anchor) ?? 0) < need) return false;
        }
      }
    }
    return true;
  };
}
