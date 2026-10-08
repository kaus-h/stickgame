import * as Phaser from 'phaser';
import lab01 from '../../../content/levels/lab-01.json';
import labCollision from '../../../content/levels/lab-collision.json';
import labMoving from '../../../content/levels/lab-moving.json';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { parseLevel, parseRuntimeTuning } from '../../content';
import { vec2 } from '../../core';
import { bindDom, DesktopInputMapper, IntentQueue } from '../../input';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { WebPlatformServices } from '../../platform';
import { GameScene } from '../../render';
import { GameRuntime } from '../runtime/GameRuntime';

// Composition root for the browser build.
async function start(): Promise<void> {
  // The handwriting font must be ready before Phaser rasterizes HUD text.
  await Promise.allSettled([document.fonts.load('34px "Caveat"'), document.fonts.ready]);

  // ?level=lab-collision (GMR-24) or ?level=lab-moving (GMR-26) loads a lab (default: lab-01).
  const levels: Record<string, unknown> = {
    'lab-01': lab01,
    'lab-collision': labCollision,
    'lab-moving': labMoving,
  };
  const levelName = new URLSearchParams(window.location.search).get('level') ?? 'lab-01';
  const level = parseLevel(levels[levelName] ?? lab01);
  const intents = new IntentQueue();
  let scene: GameScene | null = null;
  const mapper = new DesktopInputMapper(
    (intent) => {
      intents.push(intent);
    },
    (x, y) => scene?.screenToWorld(x, y) ?? vec2(0, 0),
  );
  // Debug overlay and tuning panel: dev builds, or ?debug on any build for diagnosis.
  const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  const tuning = parseRuntimeTuning(runtimeTuning);
  const runtime = new GameRuntime({
    tuning,
    level,
    physics: new KinematicPhysicsAdapter(),
    intents,
    platform: new WebPlatformServices(),
    now: () => performance.now(),
    beforeTick: () => {
      mapper.beforeTick();
    },
  });
  scene = new GameScene({
    level,
    source: runtime,
    onEvents: (l) => runtime.onEvents(l),
    debug,
  });
  if (debug) {
    // Loaded on demand so the panel never weighs on the production bundle.
    void import('../../tools/tuning-panel').then(({ mountTuningPanel }) =>
      mountTuningPanel(tuning, (t) => {
        runtime.sim.retune(t.sim);
      }),
    );
  }

  // ?fps=30 (or any value) caps the display loop to test frame-rate independence.
  const fpsLimit = Number(new URLSearchParams(window.location.search).get('fps') ?? 0);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f3efe6',
    antialias: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    // The fixed-step clock needs raw frame deltas, so Phaser's delta smoothing is off.
    fps: { smoothStep: false, ...(fpsLimit > 0 ? { limit: fpsLimit } : {}) },
    scene: [scene],
  });
  game.events.once('ready', () => {
    bindDom(game.canvas, mapper);
    game.canvas.style.cursor = 'none';
  });

  // Dev-only hook for e2e tests: read state and map world points to the screen. Not in builds.
  if (import.meta.env.DEV) {
    const devScene = scene;
    Object.assign(window, {
      __stickgame: {
        snapshot: () => runtime.sim.snapshot(),
        worldToScreen: (x: number, y: number) => devScene.worldToScreen(vec2(x, y)),
        screenToWorld: (x: number, y: number) => devScene.screenToWorld(x, y),
      },
    });
  }
}

void start();
