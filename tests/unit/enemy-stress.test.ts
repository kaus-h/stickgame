import { expect, it } from 'vitest';
import { sweepPatroller } from '../../src/sim/enemies';
import type { PatrollerDef } from '../../src/sim';

const goon: PatrollerDef = {
  id: 'stress',
  kind: 'patroller',
  position: { x: 0, y: 0 },
  size: { x: 2, y: 1 },
  stomp: { minDownSpeed: 2, reboundSpeed: 15, topInset: 0.15 },
};

it('has no false or missed top classifications across 252 speed, offset and patrol cases', () => {
  let cases = 0;
  for (const speed of [1, 2, 10, 26, 60, 160]) {
    for (const x of [-1.34, -1.2, -1, -0.9, -0.85, -0.5, 0, 0.5, 0.85, 0.9, 1, 1.2, 1.34, 1.5]) {
      for (const patrolSpeed of [-3, 0, 3]) {
        const duration = 1 / 60;
        const hit = sweepPatroller(
          goon,
          { x, y: -0.85 - speed * duration * 0.4 },
          { x, y: -0.85 + speed * duration * 0.6 },
          { x: 0, y: speed },
          { x: -patrolSpeed * duration * 0.4, y: 0 },
          { x: patrolSpeed * duration * 0.6, y: 0 },
          0.35,
          duration,
        );
        const intended = Math.abs(x) <= 0.85 && speed >= 2;
        expect(
          hit?.stomp ?? false,
          `speed=${String(speed)}, x=${String(x)}, patrol=${String(patrolSpeed)}`,
        ).toBe(intended);
        cases++;
      }
    }
  }
  expect(cases).toBe(252);
});
