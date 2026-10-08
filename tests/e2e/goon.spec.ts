import { expect, test, type Page } from '@playwright/test';

interface Snap {
  player: { position: { x: number; y: number }; velocity: { x: number; y: number }; mode: string };
  enemies: { id: string; alive: boolean; position: { x: number; y: number } }[];
  rope: unknown;
  deaths: number;
  resets: number;
  completion: unknown;
  lastDeath: { cause: string; enemy: string } | null;
}
interface Probe {
  snapshot(): Snap;
  audio(): { sounds: string[] };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
  enemyPresentation(): { ready: boolean; visible: boolean; text: string };
  releaseEvidence(): {
    velocity: { x: number; y: number };
    before: { x: number; y: number };
  } | null;
}
const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Probe }).__stickgame.snapshot());

test('a moving goon stomp continues into the next rope opportunity and resets cleanly', async ({
  page,
}, info) => {
  await page.goto('/?level=lab-goon-drop&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __stickgame: Probe }).__stickgame.enemyPresentation().ready,
      ),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __stickgame: Probe }).__stickgame.resources().cameras,
      ),
    )
    .toBe(2);
  const initialResources = await page.evaluate(() =>
    (window as unknown as { __stickgame: Probe }).__stickgame.resources(),
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __stickgame: Probe }).__stickgame.audio().sounds,
    ),
  ).toContain('stomp');
  // Start the patrol from its authored phase after font/render readiness and evidence reads.
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snap(page)).resets).toBeGreaterThan(0);
  await page.keyboard.down('KeyD');
  await expect
    .poll(async () => (await snap(page)).enemies[0]?.alive, { timeout: 15_000 })
    .toBe(false);
  expect((await snap(page)).deaths).toBe(0);
  const target = await page.evaluate(() =>
    (window as unknown as { __stickgame: Probe }).__stickgame.worldToScreen(11, 2),
  );
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await expect.poll(async () => (await snap(page)).rope, { timeout: 2000 }).not.toBeNull();
  const continued = await snap(page);
  expect(continued.deaths).toBe(0);
  expect(continued.player.position.y).toBeLessThan(6.65);
  expect(continued.player.mode).toBe('tethered');
  const screenshot = info.outputPath('stomp-to-rope.png');
  await page.screenshot({ path: screenshot });
  await info.attach('Stomp continued into rope', { path: screenshot, contentType: 'image/png' });
  await page.mouse.up();
  await page.keyboard.up('KeyD');
  await expect.poll(async () => (await snap(page)).rope).toBeNull();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as unknown as { __stickgame: Probe }).__stickgame.releaseEvidence(),
      ),
    )
    .not.toBeNull();
  const release = await page.evaluate(() =>
    (window as unknown as { __stickgame: Probe }).__stickgame.releaseEvidence(),
  );
  expect(release?.before).toBeDefined();
  expect(release?.velocity).toEqual(release?.before);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snap(page)).enemies[0]?.alive).toBe(true);
  expect((await snap(page)).completion).toBeNull();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __stickgame: Probe }).__stickgame.resources(),
    ),
  ).toEqual(initialResources);
});

test('unsafe goon contact records its cause and shows feedback during the immediate retry', async ({
  page,
}, info) => {
  await page.goto('/?level=lab-goon-contact&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.keyboard.down('KeyD');
  await expect
    .poll(async () => (await snap(page)).lastDeath?.cause, { timeout: 15_000 })
    .toBe('enemy-contact');
  await page.keyboard.up('KeyD');
  const state = await snap(page);
  expect(state.lastDeath?.enemy).toBe('goon-contact');
  expect(state.enemies[0]?.alive).toBe(true);
  expect(state.resets).toBeGreaterThan(0);
  expect(state.completion).toBeNull();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __stickgame: Probe }).__stickgame.enemyPresentation().visible,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { __stickgame: Probe }).__stickgame.enemyPresentation().text,
    ),
  ).toContain('goon');
  const screenshot = info.outputPath('goon-contact-retry.png');
  await page.screenshot({ path: screenshot });
  await info.attach('Unsafe contact, retry already active', {
    path: screenshot,
    contentType: 'image/png',
  });
});
