import { expect, test, type Page } from '@playwright/test';

interface Hook {
  snapshot(): {
    player: { position: { x: number; y: number }; velocity: { x: number; y: number } };
    aim: { x: number; y: number } | null;
    target: { valid: boolean; anchor: number | null } | null;
  };
  worldToScreen(x: number, y: number): { x: number; y: number };
  screenToWorld(x: number, y: number): { x: number; y: number };
}

/** Landscape viewports from 4:3 to 32:9, including phone-like 19.5:9 and 20:9. */
const VIEWPORTS: [string, number, number][] = [
  ['4:3', 1024, 768],
  ['16:9', 1280, 720],
  ['19.5:9', 844, 390],
  ['21:9', 1680, 720],
  ['32:9', 1920, 540],
];

async function boot(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.locator('canvas').click({ position: { x: 3, y: 3 } });
}

for (const [name, w, h] of VIEWPORTS) {
  test(`world-screen mapping round-trips exactly at ${name}, including screen edges`, async ({
    page,
  }) => {
    await boot(page, w, h);
    await page.keyboard.down('KeyD'); // move the camera during the test
    await page.waitForTimeout(400);
    const worst = await page.evaluate(
      ([vw, vh]) => {
        const g = (window as unknown as { __stickgame: Hook }).__stickgame;
        let err = 0;
        // Corners, edges (safe-area-like 4 px inset) and the center.
        for (const [sx, sy] of [
          [4, 4],
          [vw - 4, 4],
          [4, vh - 4],
          [vw - 4, vh - 4],
          [vw / 2, vh / 2],
          [vw / 2, 4],
        ] as const) {
          const wp = g.screenToWorld(sx, sy);
          const back = g.worldToScreen(wp.x, wp.y);
          err = Math.max(err, Math.abs(back.x - sx), Math.abs(back.y - sy));
        }
        return err;
      },
      [w, h] as const,
    );
    await page.keyboard.up('KeyD');
    // Phaser camera matrices are float32: ~1e-5 px of round-off is expected and harmless.
    expect(worst).toBeLessThan(1e-3);
  });
}

test('a held pointer over an anchor keeps selecting it while the camera moves', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await boot(page, 1280, 720);
  // a-first at (13.5, 2): run toward it with the pointer re-placed on its rendered position
  // each poll, as a player tracking it by eye would, and record the selection every poll.
  await page.keyboard.down('KeyD');
  let samples = 0;
  let selected = 0;
  let maxAimError = 0;
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() =>
      (window as unknown as { __stickgame: Hook }).__stickgame.worldToScreen(13.5, 2),
    );
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(30);
    const snap = await page.evaluate(() =>
      (window as unknown as { __stickgame: Hook }).__stickgame.snapshot(),
    );
    if (snap.aim) {
      samples++;
      maxAimError = Math.max(maxAimError, Math.hypot(snap.aim.x - 13.5, snap.aim.y - 2));
      if (snap.target?.anchor === 0) selected++;
    }
  }
  await page.keyboard.up('KeyD');
  console.info(
    `camera-moving aim error max ${maxAimError.toFixed(3)} m over ${String(samples)} samples`,
  );
  expect(samples).toBeGreaterThan(10);
  // Camera motion between pointer placement and the tick stays well inside the selection margin.
  expect(maxAimError).toBeLessThan(0.75);
  expect(selected).toBe(samples);
});
