import { expect, test } from '@playwright/test';

interface AudioInfo {
  state: string;
  latency: number | null;
  sounds: string[];
}

test('audio unlocks on the first gesture, renders every sound and reports latency', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  const before = await page.evaluate(() =>
    (window as unknown as { __stickgame: { audio(): AudioInfo } }).__stickgame.audio(),
  );
  expect(before.state).toBe('locked');
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space'); // a jump: plays a sound through the whole chain
  // Playwright WebKit on Windows/Linux has no audio output and stays suspended; real Safari/iOS
  // audio is validated on devices (GMR-33). Elsewhere the context must be running.
  const hasWebAudio = await page.evaluate(() => typeof AudioContext !== 'undefined');
  // Without Web Audio (Playwright WebKit on Windows) the engine must stay silently locked.
  const want = !hasWebAudio
    ? ['locked']
    : browserName === 'webkit'
      ? ['running', 'suspended']
      : ['running'];
  await page.waitForFunction(
    (states) =>
      states.includes(
        (window as unknown as { __stickgame: { audio(): AudioInfo } }).__stickgame.audio().state,
      ),
    want,
    { timeout: 5000 },
  );
  const after = await page.evaluate(() =>
    (window as unknown as { __stickgame: { audio(): AudioInfo } }).__stickgame.audio(),
  );
  console.info(`audio output latency: ${String(after.latency)} s`);
  expect(after.sounds.length).toBeGreaterThanOrEqual(10);
  if (!hasWebAudio)
    test
      .info()
      .annotations.push({ type: 'note', description: 'no Web Audio in this browser build' });
  expect(errors).toEqual([]);
});
