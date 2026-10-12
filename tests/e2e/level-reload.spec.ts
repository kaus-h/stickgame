import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from '@playwright/test';

interface LevelProbe {
  level(): { id: string; revision: number; spawn: { x: number; y: number }; error: string | null };
  snapshot(): { player: { position: { x: number; y: number } }; rope: unknown };
  resources(): { textures: number; cameras: number };
}

/** Windows file watchers can temporarily deny opening a fixture for writing, including cleanup. */
async function writeLevel(file: URL, text: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(file, text);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 9 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(code ?? '')) throw error;
      await delay(50);
    }
  }
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
  const resources = () =>
    page.evaluate(() => (window as unknown as { __stickgame: LevelProbe }).__stickgame.resources());
  await expect.poll(async () => (await resources()).cameras).toBe(4);
  const initialResources = await resources();
  const other = await page.context().newPage();
  await other.goto('/?level=lab-exit-wide&renderer=canvas');
  await other.waitForFunction(() => '__stickgame' in window);
  const otherRevision = () =>
    other.evaluate(
      () => (window as unknown as { __stickgame: LevelProbe }).__stickgame.level().revision,
    );
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
    await writeLevel(
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
    await writeLevel(file, JSON.stringify({ ...source, version: 99 }, null, 2) + '\n');
    await expect.poll(async () => (await probe()).error).toContain('version');
    expect((await probe()).revision).toBe(1);
    await writeLevel(file, original);
    await expect.poll(async () => (await probe()).revision).toBe(2);
    expect((await probe()).error).toBeNull();
    // Real Phaser resources: repeated same-size page baking must release its textures/cameras.
    for (let revision = 3; revision <= 10; revision++) {
      await writeLevel(
        file,
        JSON.stringify({ ...source, name: `Reload ${String(revision)}` }, null, 2) + '\n',
      );
      await expect.poll(async () => (await probe()).revision).toBe(revision);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            }),
          ),
      );
      await expect.poll(async () => (await resources()).textures).toBe(initialResources.textures);
      expect((await resources()).cameras).toBe(initialResources.cameras);
    }
    expect((await resources()).textures).toBe(initialResources.textures);
    // Editing another level must preserve an open attempt, including held input/completion.
    expect(await otherRevision()).toBe(0);
  } finally {
    await writeLevel(file, original);
  }
});
