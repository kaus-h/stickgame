import { expect, test } from '@playwright/test';

test('boots without console errors and renders a canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  // Cold Vite starts transform Phaser and fetch the handwriting font before the canvas exists.
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
