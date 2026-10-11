import { expect, test, type Page } from '@playwright/test';

interface Vec2 {
  x: number;
  y: number;
}
interface Snap {
  tick: number;
  player: { position: Vec2; velocity: Vec2; mode: string };
  enemies: { id: string; alive: boolean; position: Vec2 }[];
  rope: { anchor: number; point: Vec2; attachedTick: number; locked: boolean } | null;
  deaths: number;
  resets: number;
  completion: unknown;
  lastDeath: { cause: string; enemy: string } | null;
}
interface ReleaseEvidence {
  type: 'ropeRelease';
  tick: number;
  velocity: Vec2;
  before: Vec2 | undefined;
}
interface Probe {
  snapshot(): Snap;
  audio(): { sounds: string[] };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): Vec2;
  enemyPresentation(): { ready: boolean; visible: boolean; text: string };
  playReplay(text: string): number;
  stopReplay(): void;
  releaseEvidence(): ReleaseEvidence | null;
}
interface Hook {
  __stickgame: Probe;
}

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as Hook).__stickgame.snapshot());

// Same proven sequence as tests/unit/enemy-replay.test.ts. The hook automatically adds a
// restart at tick 0, and every subsequent intent runs at the specified relative tick.
const STOMP_AT = 39;
const ATTACH_AT = 57;
const RELEASE_AT = 67;
const RESET_AT = 120;
const goonReplay = JSON.stringify({
  v: 1,
  b: 'goon-harness',
  l: 'lab-goon-drop',
  s: 45,
  n: 130,
  i: [
    [0, ['m', 1]],
    [ATTACH_AT, ['a', 11, 2], 'r'],
    [RELEASE_AT, 'R'],
    [RESET_AT, 'x'],
  ],
});

interface GoonObservation {
  startTick: number;
  replayTicks: number;
  stomp: { tick: number; velocity: Vec2; position: Vec2 };
  attach: {
    tick: number;
    attachedTick: number;
    anchor: number;
    point: Vec2;
    position: Vec2;
    mode: string;
  };
  release: ReleaseEvidence;
  reset: { tick: number; alive: boolean; deaths: number; resets: number; completion: unknown };
}

test('a moving goon stomp continues into the next rope opportunity and resets cleanly', async ({
  page,
}, info) => {
  // Match tether's browser-fixture budget; the replay observer itself still fails within 20s.
  test.setTimeout(60_000);
  await page.goto('/?level=lab-goon-drop&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.waitForFunction(() => {
    const hook = (window as unknown as Hook).__stickgame;
    return hook.resources().cameras === 2 && hook.enemyPresentation().ready;
  });
  const initialResources = await page.evaluate(() =>
    (window as unknown as Hook).__stickgame.resources(),
  );
  expect(
    await page.evaluate(() => (window as unknown as Hook).__stickgame.audio().sounds),
  ).toContain('stomp');

  // Observe the brief stomp/rope/release windows inside the browser, not across several
  // Playwright calls. The simulated inputs and evidence ticks remain fixed under CI load.
  const observed = await page.evaluate(
    ({ replay, stompAt, attachAt, releaseAt, resetAt }): Promise<GoonObservation> => {
      const hook = (window as unknown as Hook).__stickgame;
      const startTick = hook.snapshot().tick;
      const replayTicks = hook.playReplay(replay);
      return new Promise<GoonObservation>((resolve, reject) => {
        let stomp: GoonObservation['stomp'] | null = null;
        let attach: GoonObservation['attach'] | null = null;
        let release: ReleaseEvidence | null = null;
        let frame = 0;
        let lastTick = startTick;
        const cleanup = (): void => {
          window.clearTimeout(watchdog);
          window.cancelAnimationFrame(frame);
          hook.stopReplay();
        };
        const watchdog = window.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              `Goon replay stalled at tick ${String(lastTick - startTick)}; expected reset at ${String(resetAt)}`,
            ),
          );
        }, 20_000);
        const observe = (): void => {
          try {
            const state = hook.snapshot();
            lastTick = state.tick;
            const enemy = state.enemies[0];
            if (
              stomp === null &&
              state.tick >= startTick + stompAt + 1 &&
              state.tick < startTick + attachAt &&
              enemy?.alive === false
            ) {
              stomp = {
                tick: state.tick,
                velocity: { ...state.player.velocity },
                position: { ...state.player.position },
              };
            }
            const rope = state.rope;
            if (attach === null && rope?.attachedTick === startTick + attachAt) {
              attach = {
                tick: state.tick,
                attachedTick: rope.attachedTick,
                anchor: rope.anchor,
                point: { ...rope.point },
                position: { ...state.player.position },
                mode: state.player.mode,
              };
            }
            const evidence = hook.releaseEvidence();
            if (release === null && evidence?.tick === startTick + releaseAt) {
              release = evidence;
            }
            if (state.tick >= startTick + resetAt + 1) {
              cleanup();
              if (stomp === null || attach === null || release === null) {
                reject(
                  new Error(
                    `Missing goon evidence at tick ${String(state.tick - startTick)}: stomp=${String(stomp !== null)}, attach=${String(attach !== null)}, release=${String(release !== null)}`,
                  ),
                );
                return;
              }
              resolve({
                startTick,
                replayTicks,
                stomp,
                attach,
                release,
                reset: {
                  tick: state.tick,
                  alive: enemy?.alive === true,
                  deaths: state.deaths,
                  resets: state.resets,
                  completion: state.completion,
                },
              });
              return;
            }
            frame = window.requestAnimationFrame(observe);
          } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        frame = window.requestAnimationFrame(observe);
      });
    },
    {
      replay: goonReplay,
      stompAt: STOMP_AT,
      attachAt: ATTACH_AT,
      releaseAt: RELEASE_AT,
      resetAt: RESET_AT,
    },
  );

  await info.attach('Exact-tick goon route', {
    body: JSON.stringify(observed, null, 2),
    contentType: 'application/json',
  });

  expect(observed.replayTicks).toBe(130);
  expect(observed.stomp.tick).toBeGreaterThanOrEqual(observed.startTick + STOMP_AT + 1);
  expect(observed.stomp.tick).toBeLessThan(observed.startTick + ATTACH_AT);
  expect(observed.stomp.velocity.y).toBeLessThan(0); // rebound after the stomp
  expect(observed.attach.attachedTick).toBe(observed.startTick + ATTACH_AT);
  expect(observed.attach.tick).toBeGreaterThan(observed.attach.attachedTick);
  expect(observed.attach.tick).toBeLessThanOrEqual(observed.startTick + RELEASE_AT);
  expect(observed.attach.mode).toBe('tethered');
  expect(observed.attach.position.y).toBeLessThan(6.65);
  expect(observed.attach.anchor).toBe(0);
  expect(observed.attach.point).toEqual({ x: 11, y: 2 });
  expect(observed.release.type).toBe('ropeRelease');
  expect(observed.release.tick).toBe(observed.startTick + RELEASE_AT);
  const before = observed.release.before;
  expect(before).toBeDefined();
  if (before === undefined) throw new Error('Missing exact-tick goon release velocity');
  expect(observed.release.velocity).toEqual(before);
  expect(Math.hypot(observed.release.velocity.x, observed.release.velocity.y)).toBeGreaterThan(1);
  expect(observed.reset.tick).toBeGreaterThanOrEqual(observed.startTick + RESET_AT + 1);
  expect(observed.reset.alive).toBe(true);
  expect(observed.reset.deaths).toBe(0);
  expect(observed.reset.resets).toBeGreaterThanOrEqual(2); // hook restart + replay reset
  expect(observed.reset.completion).toBeNull();
  expect(await page.evaluate(() => (window as unknown as Hook).__stickgame.resources())).toEqual(
    initialResources,
  );
});

test('unsafe goon contact records its cause and shows feedback during the immediate retry', async ({
  page,
}, info) => {
  await page.goto('/?level=lab-goon-contact&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  // Input binds when the scene starts, after the dev hook appears: wait for it, then focus.
  await page.waitForFunction(
    () => (window as unknown as { __stickgame: Probe }).__stickgame.resources().cameras === 2,
  );
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.mouse.up();
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
