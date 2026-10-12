import { describe, expect, it } from 'vitest';
import { swingAt } from '../../src/app/web/ui/titleDoodle';

describe('title doodle swing', () => {
  it('swings both ways within about 47 degrees, fastest at the bottom of the arc', () => {
    let min = 0;
    let max = 0;
    for (let t = 0; t < 6; t += 0.01) {
      const { angle } = swingAt(t);
      min = Math.min(min, angle);
      max = Math.max(max, angle);
    }
    expect(max).toBeCloseTo(0.82, 2);
    expect(min).toBeCloseTo(-0.82, 2);
    expect(Math.abs(swingAt(0).speed)).toBeGreaterThan(Math.abs(swingAt(0.7).speed));
  });
});
