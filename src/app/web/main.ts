import * as Phaser from 'phaser';
import sfxBank from '../../../content/audio/sfx.json';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { AudioEngine, parseSfxBank, SfxDirector } from '../../audio';
import { parseRuntimeTuning } from '../../content';
import { LevelRegistry } from '../../content/level-registry';
import {
  BUILD_HASH,
  decodeReplay,
  encodeReplay,
  metersToPixels,
  parseAssistMode,
  vec2,
  type Intent,
  type ReplayInput,
  type Vec2,
} from '../../core';
import {
  bindDom,
  bindTouchDom,
  DesktopInputMapper,
  IntentQueue,
  TOUCH_SCHEMES,
  TouchInputMapper,
  type SafeAreaInsets,
  type TouchScheme,
} from '../../input';
import { levelFingerprint, type LevelDef, type SimEvent } from '../../sim';
import { KinematicPhysicsAdapter } from '../../physics/backends/kinematic/KinematicPhysicsAdapter';
import { createPlatformServices, SaveStore } from '../../platform';
import { GameScene } from '../../render';
import { GameRuntime } from '../runtime/GameRuntime';
import { RunTiming, validatePb, type RunSummary } from '../runtime/RunTiming';
import { exitTelemetry } from '../../telemetry/exitTelemetry';
import chapterJson from '../../../content/chapters/chapter-1.json';
import stringsEn from '../../../content/strings/en.json';
import { enemyTelemetry } from '../../telemetry/enemyTelemetry';
import { levelSources } from './level-catalog';
import { GameFlowUi, type ResultSplit } from './ui/GameFlowUi';
import { parseChapter, playOrder } from './ui/flow';

// Composition root for the browser build.
async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  // Native Capacitor shell or plain web, decided once at startup (ADR-002, GMR-33).
  const platform = await createPlatformServices();
  // Local-first save (GMR-48): progress, bests and settings. Loading never blocks on failure.
  const save = new SaveStore(platform.storage);
  const saved = await save.load();

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
  const registry = new LevelRegistry(levelSources);
  const chapter = parseChapter(chapterJson, new Set(registry.ids));
  // Without ?level= the game boots to the title screen (GMR-47); ?level= jumps straight into a
  // level (labs, tests and level authoring) and keeps the in-canvas exit card.
  const flowMode = !params.has('level');
  let levelName = params.get('level') ?? playOrder(chapter)[0]?.id ?? 'lab-01';
  let level = registry.load(levelName);
  let levelRevision = 0;
  let levelError: string | null = null;
  const intents = new IntentQueue();
  // Dev evidence compares release with the exact pre-tick velocity, independent of browser latency.
  const releaseTrace = import.meta.env.DEV
    ? {
        before: new Map<number, Vec2>(),
        evidence: null as
          (Extract<SimEvent, { type: 'ropeRelease' }> & { before: Vec2 | undefined }) | null,
      }
    : null;
  let scene: GameScene | null = null;
  // Dev-only scripted input for e2e (GMR-103): intents keyed by ticks after the script starts.
  let devScript: { start: number; byTick: Map<number, readonly Intent[]> } | null = null;
  // The pause intent (Esc, P, touch pause) opens the menu; it never reaches the simulation.
  let flow: GameFlowUi | null = null;
  // The ghost toggle (G) is a presentation setting: like pause, it never reaches the simulation.
  let toggleGhost = (): void => undefined;
  const pushIntent = (intent: Intent): void => {
    if (intent.type === 'pause') {
      flow?.onPauseKey();
      return;
    }
    if (intent.type === 'ghostToggle') {
      toggleGhost();
      return;
    }
    intents.push(intent);
  };
  const mapper = new DesktopInputMapper(
    pushIntent,
    (x, y) => scene?.screenToWorld(x, y) ?? vec2(0, 0),
  );
  // Touch controls (GMR-27): same intents, same simulation. Shown on the first touch or ?touch=1.
  // ?scheme=direct-touch|drag-aim|reticle-offset, ?move=digital|analog, ?touchScale=1.2.
  const scheme =
    TOUCH_SCHEMES.find((k) => k === params.get('scheme')) ??
    TOUCH_SCHEMES.find((k) => k === saved.settings.touchScheme) ??
    'direct-touch';
  const touch = new TouchInputMapper(
    pushIntent,
    (x, y) => scene?.screenToWorld(x, y) ?? vec2(0, 0),
    {
      scheme,
      moveStyle: params.get('move') === 'analog' ? 'analog' : 'digital',
      scale: Number(params.get('touchScale')) || 1,
    },
  );
  if (params.get('touch') === '1') touch.activate();
  const layoutTouch = (): void => {
    touch.setViewport(window.innerWidth, window.innerHeight, readSafeArea());
  };
  layoutTouch();
  window.addEventListener('resize', layoutTouch);
  // Aim assist (GMR-27): explicit, opt-in, visible. ?assist=wide-select|snap; default standard.
  const assistMode = parseAssistMode(params.get('assist')) ?? saved.settings.assist;
  // Debug overlay and tuning panel: dev builds, or ?debug on any build for diagnosis.
  const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  const tuning = parseRuntimeTuning(runtimeTuning);
  // Audio (GMR-41): procedural SFX rendered at unlock; fire-and-forget, never delays play.
  const audio = new AudioEngine(parseSfxBank(sfxBank));
  const sfx = new SfxDirector(audio);
  audio.setVolume('master', saved.settings.masterVolume);
  audio.setVolume('sfx', saved.settings.sfxVolume);
  audio.setVolume('music', saved.settings.musicVolume);
  audio.setMuted(saved.settings.muted);
  const unlockAudio = (): void => {
    audio.unlock();
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
  // Racing-style timing (GMR-103): run replay, lives, splits and the PB ghost, which plays in a
  // headless simulation with a physics world of its own.
  const timing = new RunTiming({
    tuning: tuning.sim,
    level,
    physics: new KinematicPhysicsAdapter(),
    build: BUILD_HASH,
    assist: tuning.assist,
  });
  timing.setGhostVisible(saved.settings.ghost);
  /** Load the saved PB for `lvl`; a replay that no longer fits the level or build is discarded. */
  const loadPb = (lvl: LevelDef): void => {
    const stored = save.current.pbs[lvl.id];
    if (!stored) {
      timing.setPb(null);
      return;
    }
    const checked = validatePb(stored, lvl, BUILD_HASH);
    if ('pb' in checked) timing.setPb(checked.pb);
    else {
      console.info(`PB ghost for ${lvl.id} discarded: ${checked.reason}`);
      save.clearPersonalBest(lvl.id);
      timing.setPb(null);
    }
  };
  loadPb(level);
  toggleGhost = () => {
    const on = !save.current.settings.ghost;
    save.updateSettings({ ghost: on });
    timing.setGhostVisible(on);
  };
  // Run bookkeeping for the save: deaths since the last clear; a clear records time and deaths.
  // Play time (all runs, restarts included) feeds the time to first clear.
  let runDeaths = 0;
  const flushDeaths = (): void => {
    const playTicks = timing.takePlayTicks(runtime.sim);
    if (runDeaths === 0 && playTicks === 0) return;
    save.recordRun(level.id, { cleared: false, ticks: 0, deaths: runDeaths, playTicks });
    runDeaths = 0;
  };
  const resultsSplits = (r: RunSummary): ResultSplit[] => [
    ...r.splits.map((ticks, index) => ({
      index,
      ticks,
      pbTicks: r.previousPb?.splits[index] ?? null,
    })),
    { index: -1, ticks: r.runTicks, pbTicks: r.previousPb?.ticks ?? null },
  ];
  platform.onVisibilityChange((visible) => {
    audio.setVisible(visible);
    if (!visible) flushDeaths();
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
      touch.beforeTick();
      const state = runtime.sim.snapshot();
      if (devScript) {
        for (const intent of devScript.byTick.get(state.tick - devScript.start) ?? [])
          intents.push(intent);
      }
      if (releaseTrace) {
        releaseTrace.before.set(state.tick, state.player.velocity);
        if (releaseTrace.before.size > 128) {
          const first = releaseTrace.before.keys().next().value;
          if (first !== undefined) releaseTrace.before.delete(first);
        }
      }
      sfx.onFrame(state);
    },
    assist: { mode: assistMode, ...tuning.assist },
    timing,
  });
  runtime.onEvents((events) => {
    sfx.onEvents(events);
    for (const e of events) {
      if (releaseTrace && e.type === 'ropeRelease')
        releaseTrace.evidence = { ...e, before: releaseTrace.before.get(e.tick) };
      if (releaseTrace && e.type === 'reset') releaseTrace.evidence = null;
      const telemetry = exitTelemetry(level, e);
      if (telemetry) platform.analytics.track(telemetry);
      const enemy = enemyTelemetry(level, e);
      if (enemy) platform.analytics.track(enemy);
      if (e.type === 'death') runDeaths++;
      else if (e.type === 'exit') {
        const before = save.current.levels[level.id];
        const previousBest = before?.bestTicks ?? null;
        const firstClear = before?.cleared !== true;
        const deaths = runDeaths;
        const playTicks = timing.takePlayTicks(runtime.sim);
        save.recordRun(level.id, { cleared: true, ticks: e.runTicks, deaths, playTicks });
        runDeaths = 0;
        const run = timing.takeResult();
        if (run?.isPb && run.replay) {
          const pb = { ticks: run.runTicks, splits: run.splits, replay: run.replay };
          save.setPersonalBest(level.id, {
            ticks: pb.ticks,
            splits: pb.splits,
            replay: encodeReplay(pb.replay),
            levelVersion: levelFingerprint(level),
          });
          timing.setPb(pb);
        }
        if (flowMode && flow) {
          flow.showResults({
            levelId: level.id,
            ticks: e.runTicks,
            deaths: run?.deaths ?? deaths,
            newBest: previousBest !== null && e.runTicks < previousBest,
            ...(run
              ? {
                  pbDelta: run.previousPb ? run.runTicks - run.previousPb.ticks : null,
                  lives: run.lives,
                  bestLifeTicks: run.bestLifeTicks,
                  splits: resultsSplits(run),
                }
              : {}),
            firstClearTicks: firstClear
              ? (save.current.levels[level.id]?.firstClearTicks ?? null)
              : null,
          });
        }
      }
    }
  });
  scene = new GameScene({
    level,
    source: runtime,
    onEvents: (l) => runtime.onEvents(l),
    debug,
    touchControls: () => (touch.active ? touch.state() : null),
    reducedMotion: () => {
      const r = save.current.settings.reducedMotion;
      return r === 'system' ? undefined : r === 'on';
    },
    showExitResult: !flowMode,
    overview: params.has('overview'),
    strings: stringsEn,
  });

  // Game flow (GMR-47): title, level select, pause, results, settings.
  const gameScene = scene;

  // Rope design overlay (GMR-54): dev-only reach circles and swing arcs, drawn once per scene
  // creation when ?design=1 is present. Loaded on demand so it never weighs on the production
  // bundle. If this wiring ever looks wrong, the overlay module is standalone: call
  // drawRopeDesign with a world-space Graphics, the level, tuning and metersToPixels(1).
  if (params.get('design') === '1') {
    gameScene.events.on(Phaser.Scenes.Events.CREATE, () => {
      void import('../../tools/design-overlay/RopeDesignOverlay').then(({ drawRopeDesign }) => {
        drawRopeDesign(gameScene.add.graphics().setDepth(50), level, tuning, metersToPixels(1));
      });
    });
  }
  flow = new GameFlowUi(document.body, stringsEn, chapter, () => save.current, {
    play: (levelId) => {
      flushDeaths();
      mapper.blur();
      intents.clear();
      runtime.sim.setAssist({ mode: save.current.settings.assist, ...tuning.assist });
      if (levelId === level.id) {
        intents.push({ type: 'restart' });
        return;
      }
      const next = registry.load(levelId);
      levelName = levelId;
      runtime.replaceLevel(next);
      level = next;
      loadPb(next);
      gameScene.replaceLevel(next);
    },
    restart: () => {
      intents.push({ type: 'restart' });
    },
    respawn: () => {
      intents.push({ type: 'respawn' });
    },
    setMenuPaused: (paused) => {
      runtime.pause('menu', paused);
      // Keys pressed in the menus (Enter, Space) must not leak into the next attempt.
      if (!paused) {
        mapper.blur();
        intents.clear();
      }
    },
    settings: (patch) => {
      save.updateSettings(patch);
      const st = save.current.settings;
      audio.setVolume('master', st.masterVolume);
      audio.setVolume('sfx', st.sfxVolume);
      audio.setVolume('music', st.musicVolume);
      audio.setMuted(st.muted);
      timing.setGhostVisible(st.ghost);
    },
  });
  if (flowMode) {
    runtime.pause('menu', true);
    flow.showTitle();
  } else flow.screen = 'playing';
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
    bindTouchDom(game.canvas, touch);
    game.canvas.style.cursor = 'none';
  });

  // Accept the catalog boundary: JSON updates travel here without reloading the document.
  // Compile first; malformed edits leave the running attempt intact until the file is fixed.
  if (import.meta.hot) {
    import.meta.hot.accept('./level-catalog', (catalog) => {
      if (!catalog) return;
      try {
        const nextRegistry = new LevelRegistry(
          catalog.levelSources as Readonly<Record<string, unknown>>,
        );
        const next = nextRegistry.load(levelName);
        levelError = null;
        // A catalog edit can concern another open level. Preserve this attempt and its input.
        if (JSON.stringify(next) === JSON.stringify(level)) return;
        mapper.blur();
        intents.clear();
        intents.clearLog();
        runtime.replaceLevel(next);
        level = next;
        loadPb(next);
        scene.replaceLevel(next);
        levelRevision++;
        levelError = null;
      } catch (error) {
        levelError = error instanceof Error ? error.message : String(error);
        console.warn(`Level reload rejected: ${levelError}`);
      }
    });
  }

  // Dev-only hook for e2e tests: read state and map world points to the screen. Not in builds.
  if (import.meta.env.DEV) {
    const devScene = scene;
    Object.assign(window, {
      __stickgame: {
        snapshot: () => runtime.sim.snapshot(),
        resources: () => ({
          textures: game.textures.getTextureKeys().length,
          cameras: devScene.cameras.cameras.length,
        }),
        exitPresentation: () => {
          const result = devScene.children.getByName('exit-result') as
            Phaser.GameObjects.Text | undefined;
          const miss = devScene.children.getByName('exit-miss') as
            Phaser.GameObjects.Text | undefined;
          return {
            ready: !!result,
            result: result?.visible ?? false,
            resultText: result?.text ?? '',
            miss: miss?.visible ?? false,
            missText: miss?.text ?? '',
          };
        },
        worldToScreen: (x: number, y: number) => devScene.worldToScreen(vec2(x, y)),
        screenToWorld: (x: number, y: number) => devScene.screenToWorld(x, y),
        save: () => ({ data: save.current, source: save.source }),
        flushSave: async () => {
          flushDeaths();
          await save.flush();
        },
        touch: {
          state: () => touch.state(),
          layout: () => touch.layout(),
          setScheme: (s: TouchScheme) => {
            touch.setScheme(s);
          },
        },
        flow: () => flow.screen,
        // GMR-103: racing state, and a scripted run (a replay restarted from the next tick).
        race: () => {
          const view = timing.view();
          const text = (name: string) => {
            const t = devScene.children.getByName(name) as Phaser.GameObjects.Text | undefined;
            return { visible: t?.visible ?? false, text: t?.text ?? '', color: t?.style.color };
          };
          return {
            pb: view.pb,
            ghostEnabled: view.ghostEnabled,
            ghost: view.ghost
              ? {
                  runTick: view.ghost.current.runTick,
                  position: view.ghost.current.player.position,
                }
              : null,
            split: view.split,
            hud: {
              run: text('run-timer'),
              life: text('life-timer'),
              splitTime: text('split-time'),
              splitDelta: text('split-delta'),
            },
            savedPb: save.current.pbs[level.id] ?? null,
          };
        },
        playReplay: (replayText: string) => {
          const replay = decodeReplay(replayText, BUILD_HASH).replay;
          const byTick = new Map<number, readonly Intent[]>(
            replay.inputs.map((input: ReplayInput) => [input.tick, input.intents]),
          );
          byTick.set(0, [{ type: 'restart' }, ...(byTick.get(0) ?? [])]);
          devScript = { start: runtime.sim.snapshot().tick, byTick };
          return replay.ticks;
        },
        stopReplay: () => {
          devScript = null;
        },
        // Shows the results card for the current level as if it had just been cleared.
        debugResults: (ticks: number, deaths: number) => {
          flow.showResults({ levelId: level.id, ticks, deaths, newBest: true });
        },
        audio: () => ({ state: audio.state, latency: audio.latency(), sounds: audio.soundNames }),
        releaseEvidence: () => releaseTrace?.evidence ?? null,
        enemyPresentation: () => {
          const label = devScene.children.getByName('enemy-cause') as
            Phaser.GameObjects.Text | undefined;
          return { ready: !!label, visible: label?.visible ?? false, text: label?.text ?? '' };
        },
        level: () => ({
          id: level.id,
          revision: levelRevision,
          spawn: level.spawn,
          error: levelError,
        }),
      },
    });
  }
}

/**
 * env(safe-area-inset-*) as CSS px numbers. index.html maps them to --safe-* variables and pads a
 * hidden probe with them, because getComputedStyle resolves padding but not custom properties.
 */
function readSafeArea(): SafeAreaInsets {
  const probe = document.getElementById('safe-area-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const css = getComputedStyle(probe);
  const px = (v: string): number => Number.parseFloat(v) || 0;
  return {
    top: px(css.paddingTop),
    right: px(css.paddingRight),
    bottom: px(css.paddingBottom),
    left: px(css.paddingLeft),
  };
}

void start();
