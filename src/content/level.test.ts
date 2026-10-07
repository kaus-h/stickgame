import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import labCollision from '../../content/levels/lab-collision.json';
import labMoving from '../../content/levels/lab-moving.json';
import { vec2 } from '../core';
import {
  anchorPathPeaks,
  LevelError,
  MAX_ANCHOR_ACCEL,
  MAX_ANCHOR_SPEED,
  parseLevel,
} from './level';

const withAnchor = (anchor: unknown) => ({ ...lab01, anchors: [anchor] });
const mover = (path: Record<string, unknown>) =>
  withAnchor({ id: 'm', position: [0, 0], path: { to: [4, 0], period: 4, ...path } });

describe('moving anchor paths (GMR-26)', () => {
  it('keeps the {to, period} form and accepts an optional phase in [0, 1)', () => {
    const plain = parseLevel(mover({})).anchors[0];
    expect(plain?.path).toEqual({ to: vec2(4, 0), period: 4 });
    expect(parseLevel(mover({ phase: 0.25 })).anchors[0]?.path?.phase).toBe(0.25);
    expect(parseLevel(mover({ phase: 0 })).anchors[0]?.path?.phase).toBe(0);
    expect(() => parseLevel(mover({ phase: 1 }))).toThrow('level.anchors[0].path.phase');
    expect(() => parseLevel(mover({ phase: -0.1 }))).toThrow(LevelError);
    expect(() => parseLevel(mover({ phase: 'late' }))).toThrow('level.anchors[0].path.phase');
  });

  it('peaks follow from span and period: half-span·ω and half-span·ω²', () => {
    const p = anchorPathPeaks(vec2(0, 0), vec2(8, 0), 4);
    expect(p.speed).toBeCloseTo((Math.PI * 8) / 4, 12);
    expect(p.accel).toBeCloseTo(4 * (Math.PI / 2) ** 2, 12);
  });

  it('rejects paths outside the speed and acceleration envelope, naming the anchor', () => {
    // 12 m in 4 s: 9.4 m/s.
    expect(() => parseLevel(mover({ to: [12, 0], period: 4 }))).toThrow(
      /level\.anchors\[0\]\.path: peak speed 9\.42 m\/s exceeds 8/,
    );
    // 4 m in 2 s: 6.3 m/s but 19.7 m/s².
    expect(() => parseLevel(mover({ period: 2 }))).toThrow(/peak acceleration 19\.74/);
    // Right at the envelope edge is fine.
    const edge = parseLevel(mover({ to: [10.5, 0], period: 4.2 })).anchors[0];
    expect(edge?.path?.period).toBe(4.2);
    expect(MAX_ANCHOR_SPEED).toBe(8);
    expect(MAX_ANCHOR_ACCEL).toBe(12);
  });

  it('every shipped level stays inside the envelope', () => {
    for (const json of [lab01, labCollision, labMoving]) {
      for (const a of parseLevel(json).anchors) {
        if (!a.path) continue;
        const p = anchorPathPeaks(a.position, a.path.to, a.path.period);
        expect(p.speed, a.id).toBeLessThanOrEqual(MAX_ANCHOR_SPEED);
        expect(p.accel, a.id).toBeLessThanOrEqual(MAX_ANCHOR_ACCEL);
      }
    }
  });
});
