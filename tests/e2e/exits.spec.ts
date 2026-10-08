import { expect, test, type Page } from '@playwright/test';

interface Probe {
  snapshot(): {
    completion: { family: string; attemptTicks: number } | null;
    deaths: number;
    resets: number;
    lastExitAttempt: { reason: string | null; at: { x: number; y: number } } | null;
  };
  exitPresentation(): {
    ready: boolean;
    result: boolean;
    resultText: string;
    miss: boolean;
    missText: string;
  };
}
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Probe }).__stickgame.snapshot());
const presentation = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Probe }).__stickgame.exitPresentation());

for (const family of ['wide', 'slot', 'shaft']) {
  test(`${family} accepts authored arrival and shows results only after success`, async ({
    page,
  }, info) => {
    await page.goto(`/?level=lab-exit-${family}&renderer=canvas`);
    await page.waitForFunction(() => '__stickgame' in window);
    await expect.poll(async () => (await presentation(page)).ready).toBe(true);
    expect((await presentation(page)).result).toBe(false);
    await page.keyboard.down('KeyD');
    await expect
      .poll(async () => (await state(page)).completion?.family, { timeout: 15_000 })
      .toBe(family);
    await page.keyboard.up('KeyD');
    await expect.poll(async () => (await presentation(page)).result).toBe(true);
    expect((await presentation(page)).resultText).toContain('Exit complete');
    expect((await state(page)).deaths).toBe(0);
    const screenshot = info.outputPath(`${family}-success.png`);
    await page.screenshot({ path: screenshot });
    await info.attach(`${family} accepted`, { path: screenshot, contentType: 'image/png' });
    await page.keyboard.press('KeyR');
    await expect.poll(async () => (await state(page)).completion).toBeNull();
    await expect.poll(async () => (await presentation(page)).result).toBe(false);
    expect((await state(page)).resets).toBeGreaterThan(0);
  });
}

test('a rejected arrival shows spatial feedback and death retries without results', async ({
  page,
}, info) => {
  await page.goto('/?level=lab-exit-miss&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await expect.poll(async () => (await presentation(page)).ready).toBe(true);
  await page.keyboard.down('KeyD');
  await expect
    .poll(async () => (await state(page)).lastExitAttempt?.reason, { timeout: 15_000 })
    .toBe('speed');
  expect((await state(page)).lastExitAttempt?.at.x).toBeCloseTo(10, 8);
  await expect.poll(async () => (await presentation(page)).miss).toBe(true);
  expect((await presentation(page)).missText).toBe('Too fast');
  expect((await presentation(page)).result).toBe(false);
  const screenshot = info.outputPath('speed-miss.png');
  await page.screenshot({ path: screenshot });
  await info.attach('Rejected entry', { path: screenshot, contentType: 'image/png' });
  await expect.poll(async () => (await state(page)).deaths, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.keyboard.up('KeyD');
  expect((await state(page)).completion).toBeNull();
  expect((await state(page)).resets).toBeGreaterThan(0);
  expect((await presentation(page)).result).toBe(false);
});
