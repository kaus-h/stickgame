import * as Phaser from 'phaser';
import lab01 from '../../../content/levels/lab-01.json';
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

  const level = parseLevel(lab01);
  const intents = new IntentQueue();
  let scene: GameScene | null = null;
  const mapper = new DesktopInputMapper(
    (intent) => {
      intents.push(intent);
    },
    (x, y) => scene?.screenToWorld(x, y) ?? vec2(0, 0),
  );
  const runtime = new GameRuntime({
    tuning: parseRuntimeTuning(runtimeTuning),
    level,
    physics: new KinematicPhysicsAdapter(),
    intents,
    platform: new WebPlatformServices(),
    now: () => performance.now(),
    beforeTick: () => {
      mapper.beforeTick();
    },
  });
  scene = new GameScene({ level, source: runtime, onEvents: (l) => runtime.onEvents(l) });

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
}

void start();
