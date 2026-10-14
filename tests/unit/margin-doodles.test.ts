import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/content';
import type * as Phaser from 'phaser';
import {
  ANCHOR_CLEARANCE,
  doodleClear,
  MarginDoodles,
  placeDoodles,
  SPIDER_WAIT_LIFT,
} from '../../src/render/living/marginDoodles';

const load = (id: string) =>
  parseLevel(JSON.parse(readFileSync(`content/levels/${id}.json`, 'utf8')) as unknown);

describe('margin doodles (GMR-114)', () => {
  for (const id of ['1-1', '1-2', '1-3', '2-1']) {
    it(`${id}: placement is deterministic and clear of anchors and solids`, () => {
      const level = load(id);
      const a = placeDoodles(level, level.spawn);
      expect(placeDoodles(level, level.spawn)).toEqual(a);
      expect(a.length).toBeGreaterThan(2);
      expect(a.filter((d) => d.kind === 'spider').length).toBeLessThanOrEqual(1);
      for (const d of a) {
        expect(doodleClear(level, d.x, d.y)).toBe(true);
        for (const anchor of level.anchors)
          expect(
            Math.hypot(anchor.position.x - d.x, anchor.position.y - d.y),
          ).toBeGreaterThanOrEqual(ANCHOR_CLEARANCE);
      }
      if (id === '1-1')
        console.log(JSON.stringify(a.map((d) => [d.kind, +d.x.toFixed(1), +d.y.toFixed(1)])));
    });
  }

  it('places nothing when there is no sky', () => {
    const level = {
      id: 'no-sky',
      bounds: { minX: 0, minY: 0, maxX: 40, maxY: 3 },
      solids: [
        {
          id: 'floor',
          points: [
            { x: 0, y: 2 },
            { x: 40, y: 2 },
            { x: 40, y: 3 },
            { x: 0, y: 3 },
          ],
        },
      ],
      anchors: [],
    } as unknown as Parameters<typeof placeDoodles>[0];
    const spawn = { x: 2, y: 1.5 };
    expect(placeDoodles(level, spawn)).toEqual([]);
  });

  it('the spider waits above the title card, then lowers itself in; never toward the hero', () => {
    const level = load('1-1');
    const doodles = new MarginDoodles({} as Phaser.GameObjects.Graphics, level, level.spawn, false);
    const spider = doodles.doodles.find((d) => d.kind === 'spider');
    expect(spider).toBeDefined();
    const at = (x: number) => ({ x, y: level.spawn.y, vx: 0, vy: 0, roped: false });
    const far = at((spider?.x ?? 0) - 7);
    for (let i = 0; i < 120; i++) doodles.update(1 / 60, far, false, true);
    expect(doodles.spiderLift()).toBe(SPIDER_WAIT_LIFT);
    for (let i = 0; i < 480; i++) doodles.update(1 / 60, far, false);
    expect(doodles.spiderLift() ?? 1).toBeLessThan(0.05);
    // A hero who is close when the card goes keeps it up its thread.
    const fresh = new MarginDoodles({} as Phaser.GameObjects.Graphics, level, level.spawn, false);
    for (let i = 0; i < 240; i++) fresh.update(1 / 60, at(spider?.x ?? 0), false);
    expect(fresh.spiderLift() ?? 0).toBeGreaterThanOrEqual(1);
  });
});
