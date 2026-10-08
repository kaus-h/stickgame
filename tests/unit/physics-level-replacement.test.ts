import { describe, expect, it } from 'vitest';
import { PlanckPhysicsAdapter } from '../../src/physics/backends/planck/PlanckPhysicsAdapter';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';

for (const Backend of [PlanckPhysicsAdapter, KinematicPhysicsAdapter]) {
  describe(`${Backend.name} level replacement`, () => {
    it('clears bodies, anchors, joints and collision without replacing the world', () => {
      const physics = new Backend();
      const world = (physics as unknown as { world?: unknown }).world;
      physics.setGeometry([{ a: { x: -10, y: 1 }, b: { x: 10, y: 1 }, kind: 'solid' }]);
      const body = physics.createBody({
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        radius: 0.3,
      });
      const anchor = physics.createKinematicAnchor({ x: 0, y: -5 });
      physics.attachRope(body, { kind: 'kinematic', anchor, offset: { x: 0, y: 0 } }, 5);
      physics.clearLevel();
      expect(physics.stats()).toEqual({ bodies: 0, joints: 0, contacts: 0 });
      expect(physics.drainContacts()).toEqual([]);
      expect(physics.raycast({ x: 0, y: 0 }, { x: 0, y: 2 })).toBeNull();
      expect((physics as unknown as { world?: unknown }).world).toBe(world);
      const next = physics.createBody({
        position: { x: 2, y: 0 },
        velocity: { x: 1, y: 0 },
        radius: 0.3,
      });
      expect(next).toBe(0);
      physics.step(1 / 60, 2);
      expect(physics.bodyState(next).position.x).toBeGreaterThan(2);
      physics.dispose();
    });
  });
}
