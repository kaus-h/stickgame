import { expect, test } from '@playwright/test';
import type { LabReport } from '../../src/tools/device-lab';
import { GOLDEN } from '../../src/tools/device-lab/golden';

// The device lab (GMR-33) must run in a desktop browser too: that is how it is developed and how
// its numbers are sanity-checked before anyone carries it to a phone.
test('device lab renders live metrics and reproduces the golden replay hashes', async ({
  page,
  browserName,
}) => {
  await page.goto('/?scene=device-lab&duration=5');
  await expect(page.locator('.dl-panel')).toBeVisible();

  // Tap a few times (mouse pointerdown path) so the touch-to-render metric has samples.
  const canvas = page.locator('.dl-canvas');
  for (let i = 0; i < 6; i++) {
    await canvas.click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(3000);

  await expect(page.locator('.dl-row', { hasText: 'p50 / p95 / p99 ms' })).toContainText(/\d/);
  await expect(page.locator('.dl-row', { hasText: 'result' }).first()).toContainText(
    'identical to golden',
  );

  const report = await page.evaluate(() =>
    (window as unknown as { __deviceLab: { report(): LabReport } }).__deviceLab.report(),
  );
  console.log(
    `[device-lab] ${browserName}: frames=${String(report.frames.frames)} p99=${report.frames.p99Ms.toFixed(1)}ms ` +
      `refresh~${String(report.frames.refreshHzEstimate)}Hz touchP95=${String(report.touch['presentedP95Ms'])}ms`,
  );
  expect(report.frames.frames).toBeGreaterThan(30);
  expect(report.frames.p50Ms).toBeGreaterThan(0);
  expect(report.touch['measured']).toBeGreaterThan(0);
  // Headless Firefox on Linux CI has no WebGL; there the lab must report it, not crash.
  const hasWebGL = await page.evaluate(
    () =>
      document.createElement('canvas').getContext('webgl2') !== null ||
      document.createElement('canvas').getContext('webgl') !== null,
  );
  expect(report.webgl['available']).toBe(hasWebGL);
  expect(report.determinism?.identical).toBe(true);
  expect(report.determinism?.measured.mainFinal).toBe(GOLDEN.mainFinal);
  expect(report.run.targetSeconds).toBe(5);
  expect(Array.isArray(report.checks)).toBe(true);
});
