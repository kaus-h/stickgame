import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { metersToPixels as m, vec2 } from '../../src/core';
import { drawPatroller, enemyOutline } from '../../src/render/enemy';
import { causeText } from '../../src/render/feedback/causeText';

describe('patroller presentation', () => {
  it('draws the vulnerable top from the authored full size and inset', () => {
    expect(enemyOutline(vec2(3, 4), vec2(2, 1), 0.25)).toEqual({
      min: vec2(2, 3.5),
      max: vec2(4, 4.5),
      safeLeft: 2.25,
      safeRight: 3.75,
    });
  });

  it('keeps every red segment inside collision and away from the safe top', () => {
    let lineColor = 0;
    const red: number[][] = [];
    const pen = {
      fillStyle: () => pen,
      fillRect: () => pen,
      lineStyle: (_width: number, color: number) => {
        lineColor = color;
        return pen;
      },
      lineBetween: (...points: number[]) => {
        if (lineColor === 0xc5302a) red.push(points);
        return pen;
      },
    };
    drawPatroller(pen as unknown as Phaser.GameObjects.Graphics, vec2(3, 4), vec2(2, 1), 0.25, 1);
    expect(red).toHaveLength(5);
    for (const [x1, y1, x2, y2] of red) {
      for (const x of [x1, x2]) {
        expect(x).toBeGreaterThanOrEqual(m(2));
        expect(x).toBeLessThanOrEqual(m(4));
      }
      for (const y of [y1, y2]) {
        expect(y).toBeGreaterThanOrEqual(m(3.5));
        expect(y).toBeLessThanOrEqual(m(4.5));
      }
      if (y1 === y2 && (y1 ?? Infinity) < m(3.6))
        expect((x2 ?? Infinity) < m(2.25) || (x1 ?? -Infinity) > m(3.75)).toBe(true);
    }
  });

  it('adds enemy cause without changing the existing GMR-43 cause-text contract', () => {
    expect(causeText('enemy-contact', null)).toBe('goon contact — aim for the flat top');
    expect(causeText('out-of-bounds', null)).toBe('fell off the page');
    expect(causeText('hazard', 'thorn-a')).toBe('spikes!');
    expect(causeText('hazard', 'lava-floor')).toBe('red ink = danger');
    expect(causeText('hazard', null)).toBe('touched red ink');
  });
});
