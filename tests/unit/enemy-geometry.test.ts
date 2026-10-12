import { describe, expect, it } from 'vitest';
import { sweepPatroller } from '../../src/sim/enemies';
import type { PatrollerDef } from '../../src/sim';
const enemy: PatrollerDef = {
  id: 'goon',
  kind: 'patroller',
  position: { x: 0, y: 0 },
  size: { x: 2, y: 1 },
  stomp: { minDownSpeed: 2, reboundSpeed: 15 },
};
describe('swept patroller vulnerability', () => {
  it('detects a 160 m/s top arrival without endpoint overlap', () => {
    const hit = sweepPatroller(
      enemy,
      { x: 0, y: -2 },
      { x: 0, y: 2 },
      { x: 0, y: 160 },
      enemy.position,
      enemy.position,
      0.35,
    );
    expect(hit?.stomp).toBe(true);
    expect(hit?.at.y).toBeCloseTo(-0.85, 12);
  });
  it('rejects upward, side, far-shoulder, insufficient speed and initial overlap', () => {
    const run = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      velocity: { x: number; y: number },
    ) => sweepPatroller(enemy, from, to, velocity, enemy.position, enemy.position, 0.35);
    expect(run({ x: 0, y: 2 }, { x: 0, y: -2 }, { x: 0, y: -160 })?.stomp).toBe(false);
    expect(run({ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 160, y: 0 })?.stomp).toBe(false);
    expect(run({ x: 1.32, y: -2 }, { x: 1.32, y: 2 }, { x: 0, y: 160 })?.stomp).toBe(false);
    expect(run({ x: 0, y: -2 }, { x: 0, y: 0 }, { x: 0, y: 1 })?.stomp).toBe(false);
    expect(run({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 10 })?.stomp).toBe(false);
  });
  it('sweeps the moving target rather than its endpoint only', () => {
    const hit = sweepPatroller(
      enemy,
      { x: 0, y: -2 },
      { x: 0, y: 2 },
      { x: 0, y: 160 },
      { x: -2, y: 0 },
      { x: 2, y: 0 },
      0.35,
    );
    expect(hit?.stomp).toBe(true);
  });
  it('landing over the top corner is a stomp: the normal is within 60 degrees of up', () => {
    // Half width 1, radius 0.35. Centre 0.1 m past the edge: normal ~17 degrees off vertical.
    const run = (x: number) =>
      sweepPatroller(
        enemy,
        { x, y: -2 },
        { x, y: 2 },
        { x: 0, y: 12 },
        enemy.position,
        enemy.position,
        0.35,
      );
    expect(run(1.1)?.stomp).toBe(true);
    expect(run(-1.1)?.stomp).toBe(true);
    expect(run(1 + 0.35 * Math.sin(Math.PI / 3) - 0.01)?.stomp).toBe(true); // just inside 60°
    expect(run(1 + 0.35 * Math.sin(Math.PI / 3) + 0.01)?.stomp).toBe(false); // just outside
  });
  it('stress-checks 1500 clean top crossings and unsafe side/shoulder arrivals', () => {
    for (let i = 0; i < 500; i++) {
      const speed = 80 + i * 0.7;
      const x = -0.84 + (i % 169) * 0.01;
      const top = sweepPatroller(
        enemy,
        { x, y: -3 },
        { x, y: 3 },
        { x: 0, y: speed },
        enemy.position,
        enemy.position,
        0.35,
      );
      const side = sweepPatroller(
        enemy,
        { x: -3, y: 0 },
        { x: 3, y: 0 },
        { x: speed, y: 0 },
        enemy.position,
        enemy.position,
        0.35,
      );
      const corner = sweepPatroller(
        enemy,
        { x: 1.32, y: -3 },
        { x: 1.32, y: 3 },
        { x: 0, y: speed },
        enemy.position,
        enemy.position,
        0.35,
      );
      expect(top?.stomp).toBe(true);
      expect(side?.stomp).toBe(false);
      expect(corner?.stomp).toBe(false);
    }
  });
});
