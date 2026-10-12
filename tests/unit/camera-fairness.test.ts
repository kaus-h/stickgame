import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import runtimeJson from '../../content/tuning/runtime.json';
import { BUILD_HASH, decodeReplay, ReplayIntentSource, type Vec2 } from '../../src/core';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import {
  attentionTarget,
  cameraScale,
  cameraTarget,
  clampToBounds,
  DEFAULT_CAMERA,
  framedAnchors,
  stepCamera,
} from '../../src/render/camera';
import { World } from '../../src/tools/route-solver/world';

/**
 * Camera fairness (GMR-44, QA-041..048): replay every committed solver route through the real
 * camera maths and check that each anchor the route ropes was on screen, inside the safe area,
 * for the 0.5 s before the press (or since the attempt began, if that is shorter).
 */
const LEAD_TICKS = 30;
/** Solver routes: the whole disc must be on screen (the solver presses from odd positions). */
const MARGIN = 0;
/** Tagged required shots, from their authored take-off: disc plus this clear margin. */
const REQUIRED_MARGIN = 0.5;
const tuning = parseRuntimeTuning(runtimeJson);
const VIEWPORTS = [
  { name: '4:3', w: 1024, h: 768, inset: 0 },
  { name: '16:9', w: 1920, h: 1080, inset: 0 },
  { name: '19.5:9 phone', w: 2532, h: 1170, inset: 141 }, // notch side, landscape, in pixels
  { name: '21:9', w: 2560, h: 1080, inset: 0 },
];
const root = join(__dirname, '..', '..', 'content');
const solved = readdirSync(join(root, 'solutions'))
  .map(
    (f) =>
      JSON.parse(readFileSync(join(root, 'solutions', f), 'utf8')) as {
        level: string;
        solved: boolean;
        replay?: string;
      },
  )
  .filter((s) => s.solved && s.replay && /^\d-\d$/.test(s.level));

interface Miss {
  viewport: string;
  tick: number;
  anchor: string;
  lead: number;
}

function check(levelId: string, replay: string): Miss[] {
  const level = parseLevel(
    JSON.parse(readFileSync(join(root, 'levels', `${levelId}.json`), 'utf8')),
  );
  const decoded = decodeReplay(replay, BUILD_HASH).replay;
  const misses: Miss[] = [];
  for (const vp of VIEWPORTS) {
    const scale = cameraScale(vp.w, vp.h, DEFAULT_CAMERA);
    const viewW = vp.w / scale;
    const viewH = vp.h / scale;
    const safeW = (vp.w - 2 * vp.inset) / scale;
    const framed = framedAnchors(level.anchors);
    const world = World.create(level, tuning);
    const source = new ReplayIntentSource(decoded);
    let center: Vec2 | null = null;
    let resets = -1;
    let attemptStart = 0;
    const seen = new Map<number, number>(); // anchor -> consecutive visible ticks
    while (world.tick < decoded.ticks) {
      const events = world.step({ intents: (t) => source.poll(t) });
      const s = world.sim.snapshot();
      const snap = center === null || s.resets !== resets;
      if (s.resets !== resets) {
        resets = s.resets;
        attemptStart = world.tick;
        seen.clear();
      }
      const target = attentionTarget(
        cameraTarget(s.player.position, s.player.velocity, DEFAULT_CAMERA),
        s.player.position,
        framed,
        viewW,
        viewH,
        tuning.sim.rope.maxLength,
      );
      center = clampToBounds(
        stepCamera(center ?? target, target, 1 / 60, DEFAULT_CAMERA, snap),
        viewW,
        viewH,
        level.bounds,
      );
      s.anchors.forEach((a, i) => {
        const r = level.anchors[i]?.radius ?? 0.4;
        const inside =
          Math.abs(a.x - (center as Vec2).x) <= safeW / 2 - r - MARGIN &&
          Math.abs(a.y - (center as Vec2).y) <= viewH / 2 - r - MARGIN;
        seen.set(i, inside ? (seen.get(i) ?? 0) + 1 : 0);
      });
      for (const e of events) {
        if (e.type !== 'ropeAttach') continue;
        const need = Math.min(LEAD_TICKS, world.tick - attemptStart);
        const lead = seen.get(e.anchor) ?? 0;
        if (lead < need)
          misses.push({
            viewport: vp.name,
            tick: e.tick,
            anchor: level.anchors[e.anchor]?.id ?? '?',
            lead,
          });
      }
    }
  }
  return misses;
}

describe('camera fairness for tagged required shots (GMR-44)', () => {
  const levels = readdirSync(join(root, 'levels'))
    .filter((f) => /^\d-\d\.json$/.test(f))
    .map((f) => parseLevel(JSON.parse(readFileSync(join(root, 'levels', f), 'utf8'))));
  it.each(levels.map((l) => [l.id, l] as const))(
    '%s: from each requiredFrom take-off, standing still, the anchor is on screen with margin',
    (_id, level) => {
      const misses: string[] = [];
      for (const vp of VIEWPORTS) {
        const scale = cameraScale(vp.w, vp.h, DEFAULT_CAMERA);
        const viewW = vp.w / scale;
        const viewH = vp.h / scale;
        const safeW = (vp.w - 2 * vp.inset) / scale;
        const framed = framedAnchors(level.anchors);
        for (const a of level.anchors) {
          if (!a.requiredFrom) continue;
          const p = a.requiredFrom;
          const c = clampToBounds(
            attentionTarget(
              cameraTarget(p, { x: 0, y: 0 }, DEFAULT_CAMERA),
              p,
              framed,
              viewW,
              viewH,
              tuning.sim.rope.maxLength,
            ),
            viewW,
            viewH,
            level.bounds,
          );
          const ok =
            Math.abs(a.position.x - c.x) <= safeW / 2 - a.radius - REQUIRED_MARGIN &&
            Math.abs(a.position.y - c.y) <= viewH / 2 - a.radius - REQUIRED_MARGIN;
          if (!ok) misses.push(`${vp.name} ${a.id}`);
        }
      }
      expect(misses).toEqual([]);
    },
  );
});

describe('camera fairness on the committed solver routes (GMR-44)', () => {
  it.each(solved.map((s) => [s.level, s.replay as string]))(
    '%s: every roped anchor is visible for 0.5 s before the press on 4 aspect ratios',
    (levelId, replay) => {
      const misses = check(levelId, replay);
      expect(misses, JSON.stringify(misses.slice(0, 6))).toEqual([]);
    },
    60_000,
  );
});
