import { expect, test } from '@playwright/test';

interface Snap {
  attemptTick: number;
  anchors: { x: number; y: number }[];
  anchorVelocities: { x: number; y: number }[];
}

test('?level=lab-moving loads the moving-anchor lab with live path state', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?level=lab-moving');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  const read = () =>
    page.evaluate(() =>
      (window as unknown as { __stickgame: { snapshot: () => Snap } }).__stickgame.snapshot(),
    );
  await expect
    .poll(async () => (await read()).attemptTick, { timeout: 10_000 })
    .toBeGreaterThan(30);
  const s = await read();
  expect(s.anchors).toHaveLength(5);
  expect(s.anchorVelocities).toHaveLength(5);
  // Some anchor is moving: the snapshot carries the path velocity for debug and level systems.
  expect(s.anchorVelocities.some((v) => Math.hypot(v.x, v.y) > 0.1)).toBe(true);
  expect(errors).toEqual([]);
});
