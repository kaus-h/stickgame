import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The committed 1-1 solution attaches at replay tick 163 and releases at tick 214.
// playReplay() keys these inputs to the current (monotonic) simulation tick.
const solution = JSON.parse(readFileSync('content/solutions/1-1.json', 'utf8')) as {
  replay: string;
  totalTicks: number;
};

const FIRST_ATTACH = 163;
const FIRST_RELEASE = 214;

interface Vec2 {
  x: number;
  y: number;
}
interface Snap {
  tick: number;
  player: { position: Vec2; mode: string };
  aim: Vec2 | null;
  rope: {
    anchor: number;
    point: Vec2;
    attachedTick: number;
    locked: boolean;
  } | null;
}
// main.ts spreads the actual ropeRelease SimEvent, then adds the pre-step `before` vector.
interface ReleaseEvidence {
  type: 'ropeRelease';
  tick: number;
  velocity: Vec2;
  before: Vec2 | undefined;
}
interface SwingObservation {
  tick: number;
  mode: string;
  anchor: number;
  point: Vec2;
  attachedTick: number;
  locked: boolean;
}
interface Hook {
  __stickgame: {
    snapshot(): Snap;
    resources(): { cameras: number };
    worldToScreen(x: number, y: number): Vec2;
    playReplay(text: string): number;
    stopReplay(): void;
    releaseEvidence(): ReleaseEvidence | null;
  };
}

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as Hook).__stickgame.snapshot());

async function open(page: Page, level: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?level=${level}&renderer=canvas`);
  await page.waitForFunction(() => '__stickgame' in window);
  // The hook is published before Phaser finishes creating the scene and binding DOM input.
  await page.waitForFunction(
    () => (window as unknown as Hook).__stickgame.resources().cameras === 2,
  );
}

test.setTimeout(60_000);

test('replayed first-anchor swing releases with the same exact-tick velocity', async ({ page }) => {
  await open(page, '1-1');

  // Observe inside the page on animation frames. A round trip through Playwright at each
  // checkpoint could miss the 51-tick tether window on a heavily loaded CI worker.
  const observed = await page.evaluate(
    ({ replay, attachAt, releaseAt }) => {
      const hook = (window as unknown as Hook).__stickgame;
      const startTick = hook.snapshot().tick;
      const replayTicks = hook.playReplay(replay);

      return new Promise<{
        startTick: number;
        replayTicks: number;
        swing: SwingObservation;
        release: ReleaseEvidence;
      }>((resolve, reject) => {
        let swing: SwingObservation | null = null;
        const observe = (): void => {
          const state = hook.snapshot();
          const rope = state.rope;
          if (
            swing === null &&
            rope?.attachedTick === startTick + attachAt &&
            rope.locked &&
            state.player.mode === 'tethered'
          ) {
            swing = {
              tick: state.tick,
              mode: state.player.mode,
              anchor: rope.anchor,
              point: { ...rope.point },
              attachedTick: rope.attachedTick,
              locked: rope.locked,
            };
          }

          const release = hook.releaseEvidence();
          if (release?.tick === startTick + releaseAt) {
            hook.stopReplay();
            if (swing === null) {
              reject(new Error('The first rope released without an observed locked swing'));
              return;
            }
            resolve({ startTick, replayTicks, swing, release });
            return;
          }
          if (state.tick > startTick + releaseAt + 30) {
            hook.stopReplay();
            reject(new Error('No first-anchor release at the scripted simulation tick'));
            return;
          }
          window.requestAnimationFrame(observe);
        };
        window.requestAnimationFrame(observe);
      });
    },
    { replay: solution.replay, attachAt: FIRST_ATTACH, releaseAt: FIRST_RELEASE },
  );

  expect(observed.replayTicks).toBe(solution.totalTicks);
  expect(observed.swing.attachedTick).toBe(observed.startTick + FIRST_ATTACH);
  expect(observed.swing.tick).toBeGreaterThan(observed.swing.attachedTick);
  expect(observed.swing.tick).toBeLessThanOrEqual(observed.startTick + FIRST_RELEASE);
  expect(observed.swing.mode).toBe('tethered');
  expect(observed.swing.locked).toBe(true);
  expect(observed.swing.anchor).toBe(0);
  expect(observed.swing.point).toEqual({ x: 26.5, y: 2 });

  // Simulation.detach() emits { type, tick, velocity } before control() and physics.step().
  // The dev hook's `before` is captured at that same simulation tick, not the next frame.
  expect(observed.release.type).toBe('ropeRelease');
  expect(observed.release.tick).toBe(observed.startTick + FIRST_RELEASE);
  const before = observed.release.before;
  expect(before).toBeDefined();
  if (before === undefined) throw new Error('Missing pre-release tick velocity');
  expect(observed.release.velocity).toEqual(before);
  expect(observed.release.velocity.x).toBeGreaterThan(0.5);
});

test('real keyboard and mouse inputs reach the simulation (direction only)', async ({ page }) => {
  await open(page, 'lab-01');
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.mouse.up();

  const initial = await snap(page);
  await page.keyboard.down('KeyD');
  await expect
    .poll(async () => (await snap(page)).player.position.x, { timeout: 10_000 })
    .toBeGreaterThan(initial.player.position.x + 0.2);
  await page.keyboard.up('KeyD');

  // The world-space aim is a real mouse intent consumed by the sim; its validity or
  // connection timing is intentionally not part of this tolerant DOM-input smoke test.
  const player = (await snap(page)).player.position;
  const screen = await page.evaluate(
    ([x, y]) => (window as unknown as Hook).__stickgame.worldToScreen(x, y),
    [player.x + 1.5, player.y - 1] as const,
  );
  await page.mouse.move(screen.x, screen.y);
  await expect
    .poll(
      async () => {
        const state = await snap(page);
        return state.aim ? state.aim.x - state.player.position.x : -Infinity;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.2);
  await page.mouse.down();
  await page.mouse.up();
});
