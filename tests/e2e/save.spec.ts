import { expect, test, type Page } from '@playwright/test';

interface Hook {
  snapshot(): { deaths: number };
  save(): { data: { levels: Record<string, { totalDeaths: number }> }; source: string };
  flushSave(): Promise<void>;
}

const hook = <T>(page: Page, fn: (h: Hook) => T | Promise<T>) =>
  page.evaluate((src) => {
    const h = (window as unknown as { __stickgame: Hook }).__stickgame;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return (new Function('h', `return (${src})(h)`) as (h: Hook) => unknown)(h);
  }, fn.toString()) as Promise<T>;

test.setTimeout(60_000);

test('deaths are saved locally and survive a reload', async ({ page }) => {
  await page.goto('/?level=lab-01&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  // Run and keep jumping until the lethal floor ends the attempt.
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 40 && (await hook(page, (h) => h.snapshot().deaths)) === 0; i++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(220);
    await page.keyboard.up('Space');
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('KeyD');
  expect(await hook(page, (h) => h.snapshot().deaths)).toBeGreaterThan(0);
  await hook(page, (h) => h.flushSave());

  await page.reload();
  await page.waitForFunction(() => '__stickgame' in window);
  const saved = await hook(page, (h) => h.save());
  expect(saved.source).toBe('main');
  expect(saved.data.levels['lab-01']?.totalDeaths ?? 0).toBeGreaterThan(0);
});
