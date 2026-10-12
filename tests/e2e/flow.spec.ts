import { expect, test, type Page } from '@playwright/test';

/**
 * GMR-47: Section 1 is playable from the title without dev tools. Menus are HTML (role=dialog),
 * so they are driven by role and text like a player would, with keyboard and pointer.
 */

const screen = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __stickgame: { flow(): string } }).__stickgame.flow(),
  );
const tick = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __stickgame: { snapshot(): { tick: number } } }
      ).__stickgame.snapshot().tick,
  );

test.setTimeout(60_000);

test('title → play → pause → resume; the simulation only runs while playing', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await expect(page.getByRole('heading', { name: 'StickSwing' })).toBeVisible();
  expect(await screen(page)).toBe('title');
  const t0 = await tick(page);
  await page.waitForTimeout(300);
  expect(await tick(page)).toBe(t0); // paused behind the title

  // Keyboard first: the primary action is focused.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await screen(page)).toBe('playing');
  await page.waitForTimeout(300);
  const t1 = await tick(page);
  expect(t1).toBeGreaterThan(t0);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const t2 = await tick(page);
  await page.waitForTimeout(300);
  expect(await tick(page)).toBe(t2);

  await page.getByRole('button', { name: 'Resume' }).click();
  expect(await screen(page)).toBe('playing');
});

test('level select locks unplayed levels; settings persist across a reload', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.getByRole('button', { name: 'Levels' }).click();
  await expect(page.locator('button[data-level="1-1"]')).toBeEnabled();
  await expect(page.locator('button[data-level="1-3"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Mute' }).check();
  await page.getByRole('combobox', { name: 'Aim assist' }).selectOption('wide-select');
  await page.evaluate(() =>
    (window as unknown as { __stickgame: { flushSave(): Promise<void> } }).__stickgame.flushSave(),
  );
  await page.reload();
  await page.waitForFunction(() => '__stickgame' in window);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: 'Mute' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Aim assist' })).toHaveValue('wide-select');
});

test('results Next follows Section 1 through finale 1-3', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.keyboard.press('Enter'); // Play 1-1
  await page.evaluate(() => {
    (
      window as unknown as { __stickgame: { debugResults(t: number, d: number): void } }
    ).__stickgame.debugResults(3723, 2);
  });
  await expect(page.getByRole('heading', { name: '1-1 cleared' })).toBeVisible();
  await expect(page.getByText('01:02.05')).toBeVisible();
  await expect(page.getByText('2 deaths')).toBeVisible();
  await expect(page.getByText('new best')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  expect(await screen(page)).toBe('playing');
  const levelId = () =>
    page.evaluate(
      () =>
        (window as unknown as { __stickgame: { level(): { id: string } } }).__stickgame.level().id,
    );
  expect(await levelId()).toBe('1-2');

  await page.evaluate(() => {
    (
      window as unknown as { __stickgame: { debugResults(t: number, d: number): void } }
    ).__stickgame.debugResults(1941, 0);
  });
  await expect(page.getByRole('heading', { name: '1-2 cleared' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  expect(await screen(page)).toBe('playing');
  expect(await levelId()).toBe('1-3');
});
