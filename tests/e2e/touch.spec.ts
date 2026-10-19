import { expect, test, type Page } from '@playwright/test';

/**
 * Touch controls (GMR-27) under mobile landscape emulation. Synthetic touch PointerEvents run in
 * every browser; the Chromium-only case drives real touch input through CDP.
 */

interface Snap {
  player: { position: { x: number; y: number }; mode: string };
  rope: { length: number } | null;
}
interface Control {
  id: string;
  x: number;
  y: number;
  r: number;
}
interface TouchState {
  active: boolean;
  scheme: string;
  controls: Control[];
  touches: { id: number; role: string }[];
}
type Hook = {
  __stickgame: {
    snapshot(): Snap;
    worldToScreen(x: number, y: number): { x: number; y: number };
    touch: { state(): TouchState };
  };
};

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as Hook).__stickgame.snapshot());
const touchState = (page: Page) =>
  page.evaluate(() => (window as unknown as Hook).__stickgame.touch.state());

/** Dispatch a synthetic touch pointer event on the canvas (bubbles to window listeners). */
async function touch(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  id: number,
  x = 0,
  y = 0,
): Promise<void> {
  await page.evaluate(
    ([t, pid, cx, cy]) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('no canvas');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent(t, {
          pointerId: pid,
          pointerType: 'touch',
          isPrimary: pid === 1,
          clientX: r.left + cx,
          clientY: r.top + cy,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [type, id, x, y] as const,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

const control = (s: TouchState, id: string): Control => {
  const c = s.controls.find((k) => k.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};

test.setTimeout(60_000);

/**
 * Scripted player, run inside the page on every animation frame with synthetic touch
 * PointerEvents (finger 1 holds move right, finger 2 taps jump whenever grounded past x = 4 to hop
 * up the start steps; once airborne over the ledge, finger 4 taps the first anchor (13.5, 2) to
 * highlight it and finger 3 holds the Rope button: the default `button` scheme, Targeting v2).
 * No test-runner round trip sits between seeing the state and touching; an invalid press is
 * released and retried, as a player would.
 */
function scriptedTouchRun(
  page: Page,
  right: Control,
  jump: Control,
  rope: Control,
): Promise<{ attached: boolean; roles: string[]; presses: number }> {
  return page.evaluate(
    ([rx, ry, jx, jy, px, py]) =>
      new Promise((resolve) => {
        const g = (window as unknown as Hook).__stickgame;
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const send = (type: string, id: number, x = 0, y = 0) => {
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: id,
              pointerType: 'touch',
              clientX: r.left + x,
              clientY: r.top + y,
              bubbles: true,
              cancelable: true,
            }),
          );
        };
        send('pointerdown', 1, rx, ry);
        let jumpUpAt = -1;
        let ropeCheckAt = -1;
        let presses = 0;
        const started = performance.now();
        let now = started;
        const step = () => {
          now = performance.now();
          const s = g.snapshot();
          const { mode, position } = s.player;
          if (ropeCheckAt >= 0 && now >= ropeCheckAt) {
            ropeCheckAt = -1;
            if (s.rope) {
              resolve({
                attached: true,
                roles: g.touch.state().touches.map((t) => t.role),
                presses,
              });
              return;
            }
            send('pointerup', 3);
          }
          if (jumpUpAt >= 0 && now >= jumpUpAt) {
            send('pointerup', 2);
            jumpUpAt = -1;
          } else if (jumpUpAt < 0 && mode === 'grounded' && position.x > 4) {
            send('pointerdown', 2, jx, jy);
            jumpUpAt = now + 300; // a full jump: a short tap is cut and cannot clear the 2 m step
          }
          if (ropeCheckAt < 0 && mode === 'air' && position.x > 8 && position.x < 11) {
            const a = g.worldToScreen(13.5, 2);
            send('pointerdown', 4, a.x, a.y);
            send('pointerup', 4);
            send('pointerdown', 3, px, py);
            presses++;
            ropeCheckAt = now + 60;
          }
          if (now - started > 40_000) {
            resolve({ attached: false, roles: [], presses });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    [right.x, right.y, jump.x, jump.y, rope.x, rope.y] as const,
  );
}

for (const viewport of [
  { width: 844, height: 390 },
  { width: 800, height: 360 },
]) {
  test.describe(`touch controls ${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ hasTouch: true, viewport });

    test('controls stay hidden until the first touch, then appear', async ({ page }) => {
      await page.goto('/?level=lab-01&renderer=canvas');
      await page.waitForFunction(() => '__stickgame' in window);
      await page.waitForTimeout(300);
      expect((await touchState(page)).active).toBe(false);
      await touch(page, 'pointerdown', 1, viewport.width / 2, 60);
      await touch(page, 'pointerup', 1);
      const s = await touchState(page);
      expect(s.active).toBe(true);
      expect(s.controls.map((c) => c.id).sort()).toEqual(
        ['jump', 'left', 'pause', 'respawn', 'restart', 'right', 'rope'].sort(),
      );
      for (const c of s.controls) {
        expect(c.x - c.r).toBeGreaterThanOrEqual(0);
        expect(c.x + c.r).toBeLessThanOrEqual(viewport.width);
        expect(c.y + c.r).toBeLessThanOrEqual(viewport.height);
      }
    });

    test('move right, jump, and a rope hold on the anchor attaches in the lab', async ({
      page,
    }) => {
      await page.goto('/?touch=1&level=lab-01&renderer=canvas');
      await page.waitForFunction(() => '__stickgame' in window);
      await page.waitForTimeout(400);
      const s0 = await touchState(page);
      expect(s0.active).toBe(true);
      await shot(page, `touch-controls-${String(viewport.width)}`);
      const right = control(s0, 'right');
      const jump = control(s0, 'jump');

      const run = await scriptedTouchRun(page, right, jump, control(s0, 'rope'));
      expect(run.attached).toBe(true);
      // Move and rope fingers held at once (jump may still be mid-tap).
      expect(run.roles).toEqual(expect.arrayContaining(['move', 'rope']));
      expect((await snap(page)).rope).not.toBeNull();
      await page.waitForTimeout(250);
      await shot(page, `touch-tethered-${String(viewport.width)}`);
      await touch(page, 'pointerup', 3);
      await touch(page, 'pointerup', 1);
      await page.waitForTimeout(80);
      expect((await snap(page)).rope).toBeNull();
    });
  });
}

test.describe('real touch input (CDP)', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

  test('first real touch shows the controls; real multi-touch drives move, jump and rope', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch is Chromium-only');
    const cdp = await page.context().newCDPSession(page);
    const points = new Map<number, { x: number; y: number }>();
    const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd') => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: [...points.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })),
      });
    };
    const down = async (id: number, x: number, y: number) => {
      points.set(id, { x, y });
      await send('touchStart');
    };
    const up = async (id: number) => {
      // CDP touchEnd releases every point, so lift all and put the remaining fingers back down
      // (the only fingers still down here are move, which re-presses harmlessly).
      points.delete(id);
      const rest = new Map(points);
      points.clear();
      await send('touchEnd');
      for (const [k, p] of rest) points.set(k, p);
      if (points.size > 0) await send('touchStart');
    };

    // The legacy direct-touch scheme: its play-area rope finger also exercises the per-tick aim.
    await page.goto('/?level=lab-01&renderer=canvas&scheme=direct-touch');
    await page.waitForFunction(() => '__stickgame' in window);
    await page.waitForTimeout(400);
    expect((await touchState(page)).active).toBe(false);
    await down(9, 420, 40);
    await up(9);
    const s0 = await touchState(page);
    expect(s0.active).toBe(true);
    const right = control(s0, 'right');
    const jump = control(s0, 'jump');

    // Finger 1 holds move right: the player runs.
    await down(1, right.x, right.y);
    const x0 = (await snap(page)).player.position.x;
    await page.waitForTimeout(250);
    expect((await snap(page)).player.position.x).toBeGreaterThan(x0 + 0.5);
    // Finger 2 presses jump while move is held: the player leaves the ground.
    await down(2, jump.x, jump.y);
    await page.waitForFunction(
      () => (window as unknown as Hook).__stickgame.snapshot().player.mode === 'air',
      undefined,
      { polling: 'raf', timeout: 5000 },
    );
    // Finger 3 touches the play area: a rope finger whose touch point becomes the aim.
    await down(3, 520, 90);
    const roles = (await touchState(page)).touches.map((t) => t.role).sort();
    expect(roles).toEqual(['jump', 'move', 'rope']);
    // The aim is applied on the next simulation tick (and re-projected every tick); wait for it.
    await page.waitForFunction(
      () => {
        const g = (window as unknown as Hook).__stickgame as unknown as {
          snapshot(): { aim: { x: number; y: number } | null };
          screenToWorld(x: number, y: number): { x: number; y: number };
        };
        const aim = g.snapshot().aim;
        const want = g.screenToWorld(520, 90);
        return aim !== null && Math.hypot(aim.x - want.x, aim.y - want.y) < 0.5;
      },
      undefined,
      { polling: 'raf', timeout: 5000 },
    );
    // Lifting every finger leaves nothing held.
    points.clear();
    await send('touchEnd');
    expect((await touchState(page)).touches).toEqual([]);
  });
});

test.describe('touch lab', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

  test('runs a seeded acquisition test and exports per-trial JSON', async ({ page }) => {
    await page.goto('/touch-lab.html?trials=3&seed=27&scheme=reticle-offset');
    await page.waitForFunction(() => '__touchLab' in window);
    await page.evaluate(() => {
      (window as unknown as { __touchLab: { start(): void } }).__touchLab.start();
    });
    for (let n = 0; n < 3; n++) {
      const target = await page
        .waitForFunction(() => {
          const lab = (
            window as unknown as {
              __touchLab: { active(): { target: { x: number; y: number } } | null };
            }
          ).__touchLab;
          return lab.active()?.target ?? null;
        })
        .then(async (h) => (await h.jsonValue()) as { x: number; y: number });
      const s = await page.evaluate(
        ([x, y]) =>
          (
            window as unknown as {
              __touchLab: { toScreen(x: number, y: number): { x: number; y: number } };
            }
          ).__touchLab.toScreen(x, y),
        [target.x, target.y] as const,
      );
      // reticle-offset aims 64 px above the finger: touch below the target.
      await page.evaluate(
        ([x, y]) => {
          const c = document.getElementById('lab') as HTMLCanvasElement;
          const ev = (type: string) =>
            new PointerEvent(type, {
              pointerId: 5,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
              bubbles: true,
            });
          c.dispatchEvent(ev('pointerdown'));
          c.dispatchEvent(ev('pointerup'));
        },
        [s.x, s.y + 64] as const,
      );
      await page.waitForTimeout(50);
    }
    const exported = await page.waitForFunction(() => {
      const lab = (
        window as unknown as {
          __touchLab: { runs: unknown[]; exportAll(): { runs: { summary: unknown }[] } };
        }
      ).__touchLab;
      return lab.runs.length === 1 ? lab.exportAll() : null;
    });
    const json = (await exported.jsonValue()) as {
      runs: {
        scheme: string;
        summary: { acquired: number; trials: number; occlusionRate: number };
        trials: unknown[];
      }[];
    };
    const run = json.runs[0];
    expect(run?.scheme).toBe('reticle-offset');
    expect(run?.summary).toMatchObject({ trials: 3, acquired: 3, occlusionRate: 0 });
    expect(run?.trials).toHaveLength(3);
  });
});
