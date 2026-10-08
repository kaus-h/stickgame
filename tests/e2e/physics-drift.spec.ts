import { expect, test } from '@playwright/test';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { runDriftScenario } from '../../src/tools/physics-drift/scenario';

// Same build, same inputs: every browser engine must reproduce the Node reference exactly (GMR-29/32).
const reference = runDriftScenario(new KinematicPhysicsAdapter()).digest;

test('physics drift scenario matches the Node reference bit for bit', async ({
  page,
  browserName,
}) => {
  await page.goto('/physics-drift.html');
  const digest = await page.waitForFunction(
    () => (window as unknown as { __drift?: { digest: string } }).__drift?.digest,
  );
  const value = await digest.jsonValue();
  console.log(`[drift] ${browserName}: ${String(value)}`);
  expect(value).toBe(reference);
});
