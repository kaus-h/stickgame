import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { metersToPixels as m, vec2 } from '../../src/core';
import type { SimSnapshot } from '../../src/sim';
import {
  drawImpactTarget,
  ImpactTargetFeedback,
  impactTargetSeed,
  targetMarks,
} from '../../src/render/impactTarget';

const target: SimSnapshot['targets'][number] = {
  id: 'weak-point',
  position: vec2(3, 4),
  radius: 0.6,
  hp: 2,
  minSpeed: 9,
  lastImpactSpeed: null,
};

describe('impact target presentation', () => {
  it('draws stable ink around the authored circle and a filled centre', () => {
    const seed = impactTargetSeed(target.id);
    const marks = targetMarks(target.position, target.radius, seed);
    expect(targetMarks(target.position, target.radius, seed)).toEqual(marks);
    expect(marks.centre).toEqual({ x: m(3), y: m(4) });
    expect(marks.radius).toBe(m(0.6));
    expect(marks.body.length).toBeGreaterThan(32);
    expect(impactTargetSeed('another-target')).not.toBe(seed);
    const colours: number[] = [];
    const circles: number[] = [];
    let plates = 0;
    const graphics = {
      fillStyle: (colour: number) => {
        colours.push(colour);
        return graphics;
      },
      lineStyle: (_width: number, colour: number) => {
        colours.push(colour);
        return graphics;
      },
      lineBetween: () => graphics,
      fillCircle: (_x: number, _y: number, radius: number) => {
        circles.push(radius);
        return graphics;
      },
      fillPoints: () => {
        plates++;
        return graphics;
      },
    };
    drawImpactTarget(graphics as unknown as Phaser.GameObjects.Graphics, target, target.position, {
      offset: { x: 0, y: 0 },
      shatter: null,
    });
    expect(plates).toBe(2); // Solid hatched plate + paper centre diamond, not an anchor ring.
    expect(circles).toContain(m(0.6) * 0.18);
    expect(new Set(colours)).toEqual(new Set([0x16161a, 0xf3efe6]));
    plates = 0;
    drawImpactTarget(
      graphics as unknown as Phaser.GameObjects.Graphics,
      { ...target, hp: 0 },
      target.position,
      { offset: { x: 0, y: 0 }, shatter: 0.5 },
    );
    expect(plates).toBe(6); // The broken plate becomes six separately hatched fragments.
  });

  it('shakes on hit, cracks then shatters on break and removes old feedback', () => {
    const feedback = new ImpactTargetFeedback();
    feedback.onEvents([{ type: 'targetHit', tick: 5, id: target.id, speed: 12, hpLeft: 1 }]);
    expect(feedback.visual(target, 6, false)?.offset.x).not.toBe(0);
    expect(feedback.visual(target, 15, false)?.offset).toEqual({ x: 0, y: 0 });
    feedback.onEvents([
      { type: 'targetHit', tick: 20, id: target.id, speed: 15, hpLeft: 0 },
      { type: 'targetBroken', tick: 20, id: target.id },
    ]);
    const broken = { ...target, hp: 0 };
    expect(feedback.visual(broken, 20, false)?.shatter).toBe(0);
    expect(feedback.visual(broken, 24, false)?.shatter).toBe(0);
    expect(feedback.visual(broken, 30, false)?.shatter).toBeGreaterThan(0);
    expect(feedback.visual(broken, 46, false)).toBeNull();
  });

  it('suppresses impact motion under reduced motion and clears effects at retry', () => {
    const feedback = new ImpactTargetFeedback();
    feedback.onEvents([{ type: 'targetHit', tick: 5, id: target.id, speed: 12, hpLeft: 1 }]);
    expect(feedback.visual(target, 6, true)?.offset).toEqual({ x: 0, y: 0 });
    feedback.onEvents([{ type: 'targetBroken', tick: 7, id: target.id }]);
    expect(feedback.visual({ ...target, hp: 0 }, 8, true)).toBeNull();
    feedback.onEvents([{ type: 'reset', tick: 8 }]);
    expect(feedback.visual(target, 8, false)?.offset).toEqual({ x: 0, y: 0 });
    feedback.onEvents([{ type: 'targetHit', tick: 10, id: target.id, speed: 12, hpLeft: 1 }]);
    feedback.onEvents([{ type: 'respawn', tick: 11, checkpoint: 0, voluntary: false }]);
    expect(feedback.visual(target, 11, false)?.offset).toEqual({ x: 0, y: 0 });
  });
});
