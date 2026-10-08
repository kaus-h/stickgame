import { describe, expect, it } from 'vitest';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';

describe('kinematic integrated motion trace', () => {
  it('does not expose provisional slack-rope overshoot beyond its physical leash', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGravity({ x: 0, y: 0 });
    const id = physics.createBody({
      position: { x: 0.8, y: 0 },
      velocity: { x: 160, y: 0 },
      radius: 0.35,
    });
    physics.attachRope(id, { kind: 'static', point: { x: 0, y: 0 } }, 1);
    physics.step(1 / 60, 4);
    expect(physics.bodyState(id).position.x).toBeCloseTo(1, 12);
    expect(physics.bodyMotion(id).every((segment) => segment.to.x <= 1 + 1e-10)).toBe(true);
    physics.dispose();
  });
  it('clips against the current moving-pivot leash while retaining reachable motion', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGravity({ x: 0, y: 0 });
    const id = physics.createBody({
      position: { x: 0.8, y: 0 },
      velocity: { x: 160, y: 0 },
      radius: 0.35,
    });
    const anchor = physics.createKinematicAnchor({ x: 0, y: 0 });
    physics.moveKinematicAnchor(anchor, { x: 0, y: 0 }, { x: 1, y: 0 });
    physics.attachRope(id, { kind: 'kinematic', anchor, offset: { x: 0, y: 0 } }, 1);
    physics.step(1 / 60, 4);
    expect(physics.bodyState(id).position.x).toBeCloseTo(1 + 1 / 60, 12);
    const motion = physics.bodyMotion(id);
    expect(motion[0]?.from.x).toBe(0.8);
    expect(motion[0]?.to.x).toBeCloseTo(1 + 1 / 240, 12);
    expect(motion.every((segment) => segment.to.x <= 1 + 1 / 60 + 1e-10)).toBe(true);
    physics.dispose();
  });
  it('records pre-impulse velocity then slide velocity, excluding skin correction', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGravity({ x: 0, y: 0 });
    physics.setGeometry([{ a: { x: -10, y: 1 }, b: { x: 10, y: 1 }, kind: 'solid' }]);
    const id = physics.createBody({
      position: { x: 0, y: 0.5 },
      velocity: { x: 6, y: 10 },
      radius: 0.35,
    });
    physics.step(1 / 60, 1);
    const motion = physics.bodyMotion(id);
    expect(motion).toHaveLength(2);
    expect(motion[0]?.velocity).toEqual({ x: 6, y: 10 });
    expect(motion[0]?.to.y).toBeCloseTo(0.65, 12);
    expect(motion[1]?.velocity).toEqual({ x: 6, y: 0 });
    expect(motion[1]?.from.y).toBeCloseTo(0.6499, 12);
    expect(motion[1]?.to).toEqual(physics.bodyState(id).position);
    physics.dispose();
  });
  it('keeps only the current tick and clears traces on reset and level replacement', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGravity({ x: 0, y: 0 });
    const id = physics.createBody({
      position: { x: 0, y: 0 },
      velocity: { x: 160, y: 0 },
      radius: 0.35,
    });
    for (let i = 0; i < 100; i++) {
      physics.step(1 / 60, 4);
      expect(physics.bodyMotion(id)).toHaveLength(4);
    }
    physics.resetBodies();
    expect(physics.bodyMotion(id)).toEqual([]);
    physics.step(1 / 60, 4);
    const priorTrace = physics.bodyMotion(id);
    physics.clearLevel();
    expect(priorTrace).toEqual([]);
    const next = physics.createBody({
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 0.35,
    });
    expect(physics.bodyMotion(next)).toEqual([]);
    physics.dispose();
  });
  it('does not expose overlap correction as an integrated entry movement', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGravity({ x: 0, y: 0 });
    physics.setGeometry([{ a: { x: -10, y: 1 }, b: { x: 10, y: 1 }, kind: 'solid' }]);
    const id = physics.createBody({
      position: { x: 0, y: 0.9 },
      velocity: { x: 0, y: 0 },
      radius: 0.35,
    });
    physics.step(1 / 60, 4);
    expect(physics.bodyState(id).position.y).toBeLessThan(0.9);
    expect(physics.bodyMotion(id)).toEqual([]);
    physics.dispose();
  });
});
