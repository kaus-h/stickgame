import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const solution = JSON.parse(readFileSync('content/solutions/1-1.json', 'utf8')) as {
  replay: string;
  totalTicks: number;
};

/**
 * GMR-103: racing-style run timing. The 1-1 route-solver solution is played through the dev hook
 * (exact ticks, the same intent queue the keyboard uses), so the run and the PB are deterministic.
 */

interface HudText {
  visible: boolean;
  text: string;
  color?: string;
}
interface Race {
  pb: { ticks: number; splits: (number | null)[] } | null;
  ghostEnabled: boolean;
  ghost: { runTick: number; position: { x: number; y: number } } | null;
  split: { kind: string; index: number; ticks: number; pbTicks: number | null } | null;
  hud: { run: HudText; life: HudText; splitTime: HudText; splitDelta: HudText };
  savedPb: { ticks: number } | null;
}
interface Snap {
  tick: number;
  runTick: number;
  lifeTick: number;
  lives: number;
  respawns: number;
  checkpoint: number;
  player: { position: { x: number; y: number } };
  completion: unknown;
}
type Hook = {
  __stickgame: {
    snapshot(): Snap;
    race(): Race;
    playReplay(text: string): number;
    stopReplay(): void;
  };
};

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as Hook).__stickgame.snapshot());
const race = (page: Page) => page.evaluate(() => (window as unknown as Hook).__stickgame.race());
const play = (page: Page) =>
  page.evaluate((text) => (window as unknown as Hook).__stickgame.playReplay(text), solution.replay);

const CHECKPOINT_A = { x: 50, y: 5.65 };

test.setTimeout(90_000);

async function open(page: Page): Promise<void> {
  await page.goto('/?level=1-1&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.waitForTimeout(200);
}

async function waitForCheckpoint(page: Page, index: number): Promise<void> {
  await page.waitForFunction(
    (i) => (window as unknown as Hook).__stickgame.snapshot().checkpoint >= i,
    index,
    { timeout: 30_000 },
  );
}

test('Backspace returns to the checkpoint while the run timer keeps running', async ({ page }) => {
  await open(page);
  await play(page);
  await waitForCheckpoint(page, 0);
  await page.evaluate(() => {
    (window as unknown as Hook).__stickgame.stopReplay();
  });
  const before = await snap(page);
  expect(before.checkpoint).toBe(0);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => (window as unknown as Hook).__stickgame.snapshot().respawns > 0);
  const after = await snap(page);
  expect(after.respawns).toBe(1);
  expect(after.lives).toBe(before.lives + 1);
  expect(after.runTick).toBeGreaterThan(before.runTick); // the run clock never reset
  expect(after.lifeTick).toBeLessThan(after.runTick);
  // Standing at the checkpoint (the replay's held direction may have nudged it a few ticks).
  expect(Math.abs(after.player.position.x - CHECKPOINT_A.x)).toBeLessThan(2);
  expect(Math.abs(after.player.position.y - CHECKPOINT_A.y)).toBeLessThan(1);
  await page.waitForTimeout(300);
  const later = await snap(page);
  expect(later.runTick).toBeGreaterThan(after.runTick);
  const hud = (await race(page)).hud;
  expect(hud.run.text).toMatch(/^\d\d:\d\d\.\d\d$/);
  expect(hud.life.text).toMatch(/^life \d\d:\d\d\.\d\d$/);
});

test('after a PB: the split delta shows at a checkpoint and the ghost runs', async ({ page }) => {
  await open(page);
  expect((await race(page)).ghost).toBeNull(); // no ghost until a PB exists
  await play(page);
  // First clear: no PB before, so the checkpoint split has no delta.
  await waitForCheckpoint(page, 0);
  const firstSplit = await race(page);
  expect(firstSplit.split).toMatchObject({ kind: 'checkpoint', index: 0, pbTicks: null });
  expect(firstSplit.hud.splitTime.visible).toBe(true);
  expect(firstSplit.hud.splitDelta.visible).toBe(false);
  await page.waitForFunction(
    () => (window as unknown as Hook).__stickgame.snapshot().completion !== null,
    undefined,
    { timeout: 40_000 },
  );
  const pb = await race(page);
  expect(pb.pb?.ticks).toBe(solution.totalTicks);
  expect(pb.savedPb?.ticks).toBe(solution.totalTicks);

  // Second run, same inputs: the ghost replays the PB in lockstep and the split delta is even.
  await play(page);
  await page.waitForFunction(
    () => (window as unknown as Hook).__stickgame.race().ghost !== null,
  );
  await waitForCheckpoint(page, 0);
  const atSplit = await race(page);
  expect(atSplit.split).toMatchObject({ kind: 'checkpoint', index: 0 });
  expect(atSplit.split?.pbTicks).toBe(atSplit.split?.ticks);
  expect(atSplit.hud.splitDelta.visible).toBe(true);
  expect(atSplit.hud.splitDelta.text).toBe('±0.00'); // the sign is always shown
  // Read both in one frame-free call: the ghost is on the live run tick, at the live position.
  const both = await page.evaluate(() => {
    const hook = (window as unknown as Hook).__stickgame;
    return { ghost: hook.race().ghost, live: hook.snapshot() };
  });
  expect(both.ghost?.runTick).toBe(both.live.runTick);
  expect(both.ghost?.position).toEqual(both.live.player.position);

  // G hides the ghost and shows it again.
  await page.keyboard.press('KeyG');
  await expect.poll(async () => (await race(page)).ghost).toBeNull();
  expect((await race(page)).ghostEnabled).toBe(false);
  await page.keyboard.press('KeyG');
  await expect.poll(async () => (await race(page)).ghost !== null).toBe(true);
});
