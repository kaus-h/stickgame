import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { runDriftScenario } from './scenario';

// Dev-only page (/physics-drift.html): runs the drift scenario and exposes the digest for Playwright.
const result = runDriftScenario(new KinematicPhysicsAdapter());
(window as unknown as { __drift: typeof result }).__drift = result;
document.body.textContent = result.digest;
