import * as Phaser from 'phaser';
import runtimeTuning from '../../../content/tuning/runtime.json';
import strings from '../../../content/strings/en.json';
import { SIM_DT } from '../../core';
import { GameScene, loadHeroHeads, loadLevelKit } from '../../render';
import { FilmSession } from './session';

/** The CLI owns the clock. Browser refreshes never advance this simulation. */
export async function mountFilm(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('film is available only on the dev server');
  const target = window as unknown as {
    __film?: {
      advanceTo(tick: number): ReturnType<FilmSession['result']>;
      capture(scale: number): string;
    };
  };
  const id = new URLSearchParams(window.location.search).get('level');
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('film needs a level id');
  const load = async (path: string): Promise<unknown> => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`cannot load ${path}: ${String(response.status)}`);
    return response.json() as Promise<unknown>;
  };
  const levels = import.meta.glob('../../../content/levels/*.json', {
    eager: true,
    import: 'default',
  });
  const levelJson = Object.values(levels).find(
    (raw) => typeof raw === 'object' && raw !== null && 'id' in raw && raw.id === id,
  );
  if (!levelJson) throw new Error(`unknown level id: ${id}`);
  const rawSolution = await load(`/content/solutions/${id}.json`);
  const solution = rawSolution as { solved?: boolean; replay?: string };
  if (!solution.solved || !solution.replay) throw new Error(`no solved route for ${id}`);
  const session = new FilmSession(levelJson, runtimeTuning, solution.replay);
  await Promise.all([
    loadLevelKit(),
    loadHeroHeads(),
    document.fonts.load('34px "Caveat"'),
    document.fonts.ready,
  ]);
  const scene = new GameScene({
    level: session.level,
    source: session,
    onEvents: (listener) => session.onEvents(listener),
    debug: false,
    showExitResult: true,
    strings,
    gravity: session.tuning.sim.gravity,
    ropeReach: session.tuning.sim.rope.maxLength,
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f3efe6',
    antialias: true,
    render: { preserveDrawingBuffer: true },
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    fps: { smoothStep: false },
    scene: [scene],
  });
  // Phaser boots asynchronously. Normalize even the first automatic frame before its loop binds
  // step(), otherwise the scene clock/animation would start at a wall-clock-dependent phase.
  const renderStep = game.step.bind(game);
  game.step = () => {
    const tick = session.result().tick;
    const delta = tick === 0 ? 0 : SIM_DT * 1000;
    game.loop.delta = delta;
    renderStep(tick * SIM_DT * 1000, delta);
  };
  // Wait for the real scene's first rendered frame, then disable RAF permanently. Every following
  // update (including camera, animation and feedback) receives exactly one simulation tick.
  const ready = (): void => {
    if (!game.scene.isActive('game')) return;
    game.events.off('postrender', ready);
    game.loop.stop();
    target.__film = {
      advanceTo(tick) {
        const current = session.result().tick;
        if (!Number.isSafeInteger(tick) || tick < current || tick > session.replay.ticks)
          throw new Error(
            `film tick must be in [${String(current)}, ${String(session.replay.ticks)}]`,
          );
        for (let t = current; t < tick; t++) {
          session.advance();
          game.step((t + 1) * SIM_DT * 1000, SIM_DT * 1000);
        }
        return session.result();
      },
      capture(scale) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(game.canvas.width * scale));
        canvas.height = Math.max(1, Math.round(game.canvas.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('film needs Canvas 2D for output scaling');
        context.drawImage(game.canvas, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1] ?? '';
      },
    };
  };
  game.events.on('postrender', ready);
  window.addEventListener(
    'pagehide',
    () => {
      session.dispose();
    },
    { once: true },
  );
}
