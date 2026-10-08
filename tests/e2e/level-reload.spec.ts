import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

interface LevelProbe {
  level(): { id: string; revision: number; spawn: { x: number; y: number }; error: string | null };
  snapshot(): { player: { position: { x: number; y: number } }; rope: unknown };
}

test('a real JSON edit hot reloads geometry and resets without a document reload', async ({
  page,
}, info) => {
  // One writer: other projects exercise gameplay, not simultaneous edits of one watched file.
  test.skip(info.project.name !== 'chromium', 'file-edit HMR has a single writer');
  const file = new URL('../../content/levels/lab-authoring.json', import.meta.url);
  const original = await readFile(file, 'utf8');
  const source = JSON.parse(original) as Record<string, unknown>;
  await page.goto('/?level=lab-authoring&renderer=canvas');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => '__stickgame' in window);
  await page.evaluate(() => Object.assign(window, { __levelReloadDocument: 'still-here' }));
  const probe = () =>
    page.evaluate(() => (window as unknown as { __stickgame: LevelProbe }).__stickgame.level());
  const initial = await probe();
  try {
    await page.keyboard.down('ArrowRight');
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __stickgame: LevelProbe }).__stickgame.snapshot().player
              .position.x,
        ),
      )
      .toBeGreaterThan(initial.spawn.x + 0.5);
    await page.keyboard.up('ArrowRight');
    await writeFile(
      file,
      JSON.stringify({ ...source, spawn: [5, initial.spawn.y] }, null, 2) + '\n',
    );
    await expect.poll(async () => (await probe()).revision).toBe(1);
    expect(
      await page.evaluate(
        () => (window as unknown as { __levelReloadDocument: string }).__levelReloadDocument,
      ),
    ).toBe('still-here');
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __stickgame: LevelProbe }).__stickgame.snapshot().player
              .position.x,
        ),
      )
      .toBeCloseTo(5, 2);
    expect(
      await page.evaluate(
        () => (window as unknown as { __stickgame: LevelProbe }).__stickgame.snapshot().rope,
      ),
    ).toBeNull();

    // Schema-invalid but syntactically valid edits preserve the last good running level.
    await writeFile(file, JSON.stringify({ ...source, version: 99 }, null, 2) + '\n');
    await expect.poll(async () => (await probe()).error).toContain('version');
    expect((await probe()).revision).toBe(1);
    await writeFile(file, original);
    await expect.poll(async () => (await probe()).revision).toBe(2);
    expect((await probe()).error).toBeNull();
  } finally {
    await writeFile(file, original);
  }
});
