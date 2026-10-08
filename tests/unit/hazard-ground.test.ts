import { describe, expect, it } from 'vitest';
import type { Segment } from '../../src/physics';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';

/** GMR-102: a hazard inside the ground probe must never count as standing ground. */
describe('hazards are never ground', () => {
  const hover = (kind: Segment['kind']) => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGeometry([{ a: { x: -10, y: 1 }, b: { x: 10, y: 1 }, kind }]);
    // 0.5 cm above the surface: inside the 1 cm ground probe, not touching.
    const id = physics.createBody({
      position: { x: 0, y: 1 - 0.35 - 0.005 },
      velocity: { x: 0, y: 0 },
      radius: 0.35,
    });
    const grounded = physics.bodyState(id).grounded;
    physics.dispose();
    return grounded;
  };

  it('a solid floor just below the player is ground', () => {
    expect(hover('solid')).toBe(true);
  });

  it('a lethal floor just below the player is not ground, so it grants no jump', () => {
    expect(hover('hazard')).toBe(false);
  });
});
