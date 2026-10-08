import * as Phaser from 'phaser';
import lab01 from '../../../content/levels/lab-01.json';
import labCollision from '../../../content/levels/lab-collision.json';
import labMoving from '../../../content/levels/lab-moving.json';
import sfxBank from '../../../content/audio/sfx.json';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { AudioEngine, parseSfxBank, SfxDirector } from '../../audio';
import { parseLevel, parseRuntimeTuning } from '../../content';
import { vec2 } from '../../core';
import { bindDom, DesktopInputMapper, IntentQueue } from '../../input';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { createPlatformServices } from '../../platform';
import { GameScene } from '../../render';
import { GameRuntime } from '../runtime/GameRuntime';

// Composition root for the browser build.
async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  // Native Capacitor shell or plain web, decided once at startup (ADR-002, GMR-33).
  const platform = await createPlatformServices();

  // ?scene=device-lab (or a `--mode device-lab` build, used for the native shell) runs the on-device
  // validation lab instead of the game. ?duration=SECONDS shortens the 15 minute frame-time run.
  if (
    (params.get('scene') ?? (import.meta.env.MODE === 'device-lab' ? 'device-lab' : '')) ===
    'device-lab'
  ) {
    const { mountDeviceLab, DEFAULT_DURATION_SEC } = await import('../../tools/device-lab');
    const duration = Number(params.get('duration') ?? DEFAULT_DURATION_SEC);
    mountDeviceLab({
      root: document.body,
      platform,
      durationSec: duration > 0 ? duration : DEFAULT_DURATION_SEC,
    });
    return;
  }

  // The handwriting font must be ready before Phaser rasterizes HUD text.
  await Promise.allSettled([document.fonts.load('34px "Caveat"'), document.fonts.ready]);

  // ?level=lab-collision (GMR-24) or ?level=lab-moving (GMR-26) loads a lab (default: lab-01).
  const levels: Record<string, unknown> = {
    'lab-01': lab01,
    'lab-collision': labCollision,
    'lab-moving': labMoving,
  };
  const levelName = params.get('level') ?? 'lab-01';
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
  // Audio (GMR-41): procedural SFX rendered at unlock; fire-and-forget, never delays play.
  const audio = new AudioEngine(parseSfxBank(sfxBank));
  const sfx = new SfxDirector(audio);
  const unlockAudio = (): void => {
    audio.unlock();
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
  platform.onVisibilityChange((visible) => {
    audio.setVisible(visible);
  });
  const runtime = new GameRuntime({
    tuning,
    level,
    physics: new KinematicPhysicsAdapter(),
    intents,
    platform,
    now: () => performance.now(),
    beforeTick: () => {
      mapper.beforeTick();
      sfx.onFrame(runtime.sim.snapshot());
    },
  });
  runtime.onEvents((events) => {
    sfx.onEvents(events);
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
    // ?renderer=canvas forces Canvas 2D (CI browsers without a GPU run WebGL in software).
    type:
      new URLSearchParams(window.location.search).get('renderer') === 'canvas'
        ? Phaser.CANVAS
        : Phaser.AUTO,
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
        audio: () => ({ state: audio.state, latency: audio.latency(), sounds: audio.soundNames }),
      },
    });
  }
}

void start();
