import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { runPhysicsConformance } from './physicsConformance';

runPhysicsConformance('kinematic (candidate C)', () => new KinematicPhysicsAdapter(), {
  substeps: 4,
});
