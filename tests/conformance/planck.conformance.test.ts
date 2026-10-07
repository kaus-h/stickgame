import { PlanckPhysicsAdapter } from '../../src/physics/backends/planck/PlanckPhysicsAdapter';
import { runPhysicsConformance } from './physicsConformance';

// Candidate B (not selected). Known failures are the GMR-32 evidence: swing energy loss and seam snagging.
runPhysicsConformance('planck (candidate B)', () => new PlanckPhysicsAdapter(), {
  substeps: 4,
  knownFailures: [
    'large swing keeps its energy within tolerance',
    'slides across a seam between collinear floor segments without snagging',
  ],
});
