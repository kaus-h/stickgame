import * as Phaser from 'phaser';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../content';
import { IntentQueue } from '../../input';
import { NullPhysicsAdapter } from '../../physics/backends/null/NullPhysicsAdapter';
import { WebPlatformServices } from '../../platform';
import { RuntimeLabScene } from '../../render';
import { GameRuntime } from '../runtime/GameRuntime';

// Composition root for the browser build.
const intents = new IntentQueue();
const runtime = new GameRuntime({
  tuning: parseRuntimeTuning(runtimeTuning),
  physics: new NullPhysicsAdapter(),
  intents,
  platform: new WebPlatformServices(),
  now: () => performance.now(),
});

// Temporary restart binding until the input intent layer lands (GMR-19).
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') intents.push({ type: 'restart' });
});

// ?fps=30 (or any value) caps the display loop to test frame-rate independence.
const fpsLimit = Number(new URLSearchParams(window.location.search).get('fps') ?? 0);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f2ede4',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // The fixed-step clock needs raw frame deltas, so Phaser's delta smoothing is off.
  fps: { smoothStep: false, ...(fpsLimit > 0 ? { limit: fpsLimit } : {}) },
  scene: [new RuntimeLabScene(runtime)],
});
