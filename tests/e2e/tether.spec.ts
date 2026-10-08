import { expect, test, type Page } from '@playwright/test';

interface Snap {
  player: { position: { x: number; y: number }; velocity: { x: number; y: number }; mode: string };
  rope: { length: number; point: { x: number; y: number }; taut: boolean } | null;
  target: { valid: boolean } | null;
  deaths: number;
}

const snap = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __stickgame: { snapshot(): Snap } }).__stickgame.snapshot(),
  );

const toScreen = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([wx, wy]) =>
      (
        window as unknown as {
          __stickgame: { worldToScreen(x: number, y: number): { x: number; y: number } };
        }
      ).__stickgame.worldToScreen(wx, wy),
    [x, y] as const,
  );

/** Optional evidence screenshots: set SHOTS_DIR to save them. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

test.setTimeout(60_000);

test('run, jump, tether to the first anchor, swing and release in the lab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?level=lab-01&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus without aiming
  await page.mouse.up();
  await page.waitForTimeout(400);

  const anchor = { x: 13.5, y: 2 };
  await page.keyboard.down('KeyD');
  let attached = false;
  for (let i = 0; i < 600 && !attached; i++) {
    const s = await snap(page);
    // Missed the window (ran past the anchor or died): restart and try again, like a player would.
    if (s.player.position.x > anchor.x + 3) {
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(50);
      continue;
    }
    if (s.player.mode === 'grounded' && s.player.position.x > 4) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(120);
      await page.keyboard.up('Space');
    }
    const a = await toScreen(page, anchor.x, anchor.y);
    await page.mouse.move(a.x, a.y);
    const t = await snap(page);
    if (t.player.mode === 'air' && t.player.position.x > 8 && t.target?.valid) {
      // The shot resolves on the tick the press lands; under load the state may have moved on,
      // so check and try again like a player would.
      await page.mouse.down();
      await page.waitForTimeout(50);
      attached = (await snap(page)).rope !== null;
      if (!attached) await page.mouse.up();
    }
    await page.waitForTimeout(16);
  }
  expect(attached).toBe(true);

  const onRope = await snap(page);
  expect(onRope.rope).not.toBeNull();
  expect(onRope.player.mode).toBe('tethered');
  await page.waitForTimeout(350);
  await shot(page, 'tether-swing');

  // Swing through the bottom, then let go: the first free state continues the swing velocity.
  let lastOnRope: Snap | null = null;
  for (let i = 0; i < 200 && !lastOnRope; i++) {
    const s = await snap(page);
    if (s.rope && s.player.position.x > anchor.x + 1 && s.player.velocity.x > 2) lastOnRope = s;
    else await page.waitForTimeout(16);
  }
  await page.keyboard.up('KeyD');
  expect(lastOnRope).not.toBeNull();
  await page.mouse.up();
  let flying = await snap(page);
  for (let i = 0; i < 100 && flying.rope; i++) flying = await snap(page);
  expect(flying.rope).toBeNull();
  // Released momentum: still moving the same way, with no canned launch (a slow CI frame may
  // let a few ticks of swing and gravity pass between the two reads).
  expect(flying.player.velocity.x).toBeGreaterThan(0.5);
  // Exact momentum preservation is unit-tested (Simulation.test.ts); here only the end-to-end
  // input path is checked: the rope lets go and the hero keeps moving forward.
  await shot(page, 'tether-release');
});
