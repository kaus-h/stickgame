import { expect, test, type Page } from '@playwright/test';

/** Chapter 1 on the ruled notebook with its doodled parallax landscape (owner 2026-10-23). */
interface VistaHook {
  kitPresentation(): {
    ready: boolean;
    vista: { layers: number; offsets: { id: string; x: number; y: number }[] } | null;
  };
  snapshot(): { player: { position: { x: number } } };
}

const hook = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __stickgame: VistaHook }).__stickgame.kitPresentation(),
  );

test('1-1 boots on the notebook with four transparent doodle layers that scroll at different rates', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?level=1-1&renderer=canvas');
  await page.waitForFunction(() => {
    try {
      return (window as unknown as { __stickgame: VistaHook }).__stickgame.kitPresentation().ready;
    } catch {
      return false;
    }
  });
  const start = await hook(page);
  expect(start.vista?.layers).toBe(4);
  await page.keyboard.down('d');
  await page.waitForFunction(
    () =>
      (window as unknown as { __stickgame: VistaHook }).__stickgame.snapshot().player.position.x >
      8,
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.up('d');
  const moved = await hook(page);
  const dx = (moved.vista?.offsets ?? []).map(
    (o) => o.x - (start.vista?.offsets.find((s) => s.id === o.id)?.x ?? 0),
  );
  // Clouds slowest, near bushes fastest: every layer moves, and strictly faster with nearness.
  expect(dx.length).toBe(4);
  for (let i = 1; i < dx.length; i++) expect(dx[i] ?? 0).toBeGreaterThan(dx[i - 1] ?? 0);
  expect(dx[0] ?? 0).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
