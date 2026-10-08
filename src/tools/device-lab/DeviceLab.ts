import { BUILD_HASH } from '../../core';
import type { PlatformServices } from '../../platform';
import { AudioProbe } from './audio';
import { runDeterminismCheck, type DeterminismResult } from './determinism';
import { GlProbe } from './gl';
import { FrameStats, heapGrowthMb, samplePercentile, type MemorySample } from './stats';
import { evaluate, type Check, type PlatformKind } from './thresholds';

export interface DeviceLabOptions {
  readonly root: HTMLElement;
  readonly platform: PlatformServices;
  /** Length of the frame-time run in seconds (default 15 minutes). */
  readonly durationSec?: number;
}

export interface DeviceLabApi {
  report(): LabReport;
  restart(durationSec?: number): void;
  stop(): void;
}

export interface LabReport {
  readonly lab: 'device-lab';
  readonly schema: 1;
  readonly build: string;
  readonly timestamp: string;
  readonly device: Record<string, unknown>;
  readonly run: { targetSeconds: number; elapsedSeconds: number; finished: boolean };
  readonly frames: ReturnType<FrameStats['summary']> & { histogramMs: number[] };
  readonly touch: Record<string, unknown>;
  readonly memory: Record<string, unknown>;
  readonly audio: Record<string, unknown>;
  readonly webgl: Record<string, unknown>;
  readonly determinism: DeterminismResult | null;
  readonly checks: Check[];
  readonly events: string[];
}

export const DEFAULT_DURATION_SEC = 15 * 60;
const MAX_EVENTS = 300;
const TAP_FLASH_FRAMES = 2;

const CSS = `
.dl-root{position:fixed;inset:0;background:#0f1117;color:#e8e6df;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.dl-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
.dl-panel{position:absolute;top:0;right:0;bottom:0;width:min(460px,62vw);overflow:auto;background:rgba(15,17,23,.88);padding:8px 10px calc(8px + env(safe-area-inset-bottom)) 10px;box-sizing:border-box;padding-right:calc(10px + env(safe-area-inset-right));-webkit-overflow-scrolling:touch}
.dl-panel.hidden{display:none}
.dl-toggle{position:absolute;top:calc(6px + env(safe-area-inset-top));left:calc(6px + env(safe-area-inset-left));z-index:3;font:inherit;padding:6px 10px;border-radius:6px;border:1px solid #555;background:#222;color:#eee}
.dl-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#8b8a85;text-align:center;pointer-events:none}
.dl-panel h3{margin:10px 0 4px;font-size:12px;color:#f2c14e;text-transform:uppercase;letter-spacing:.06em}
.dl-panel h3:first-child{margin-top:0}
.dl-row{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #222}
.dl-row b{font-weight:600}
.dl-btns{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.dl-btns button{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#252a36;color:#eee}
.dl-btns input{font:inherit;width:70px;padding:6px;background:#111;color:#eee;border:1px solid #555;border-radius:6px}
.dl-pass{color:#6fd08c}.dl-fail{color:#ff6b6b}.dl-na{color:#8b8a85}
.dl-hist{display:flex;align-items:flex-end;gap:1px;height:46px;margin:4px 0}
.dl-hist i{flex:1;background:#4f8cff;min-height:1px}
.dl-hist i.slow{background:#ff6b6b}
.dl-log{max-height:150px;overflow:auto;white-space:pre-wrap;color:#b9b7b0}
.dl-json{width:100%;height:80px;background:#111;color:#cfcfcf;border:1px solid #333;font:10px/1.3 ui-monospace,monospace;box-sizing:border-box}
`;

function platformKind(platform: PlatformServices): PlatformKind {
  if (platform.name === 'capacitor-ios') return 'ios';
  if (platform.name === 'capacitor-android') return 'android';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'web';
}

interface PerfMemory {
  usedJSHeapSize: number;
}

function readHeapMb(): number | null {
  const m = (performance as unknown as { memory?: PerfMemory }).memory;
  return m ? m.usedJSHeapSize / (1024 * 1024) : null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Mounts the device validation lab (GMR-33). Dev/tools layer: reached via ?scene=device-lab or a device-lab build. */
export function mountDeviceLab(opts: DeviceLabOptions): DeviceLabApi {
  const { root, platform } = opts;
  const kind = platformKind(platform);
  let targetSeconds = opts.durationSec ?? DEFAULT_DURATION_SEC;

  // --- DOM ----------------------------------------------------------------------------------
  const style = el('style');
  style.textContent = CSS;
  document.head.append(style);
  const host = el('div', 'dl-root');
  const canvas = el('canvas', 'dl-canvas');
  const hint = el(
    'div',
    'dl-hint',
    'TAP ANYWHERE: the screen flashes white\n(film it at 240 fps to confirm latency)',
  );
  hint.style.whiteSpace = 'pre';
  const toggle = el('button', 'dl-toggle', 'panel');
  const panel = el('div', 'dl-panel');
  host.append(canvas, hint, toggle, panel);
  root.append(host);
  toggle.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });

  const section = (title: string): HTMLElement => {
    panel.append(el('h3', undefined, title));
    return panel;
  };
  const rows = new Map<string, HTMLElement>();
  const row = (key: string, label: string): void => {
    const r = el('div', 'dl-row');
    const v = el('b', undefined, '-');
    r.append(el('span', undefined, label), v);
    panel.append(r);
    rows.set(key, v);
  };
  const set = (key: string, value: string, cls?: string): void => {
    const v = rows.get(key);
    if (!v) return;
    v.textContent = value;
    v.className = cls ?? '';
  };
  const button = (parent: HTMLElement, label: string, onClick: (e: MouseEvent) => void): void => {
    const b = el('button', undefined, label);
    b.addEventListener('click', onClick);
    parent.append(b);
  };

  section('Run');
  row('build', 'build');
  row('platform', 'platform');
  row('progress', 'progress');
  const runBtns = el('div', 'dl-btns');
  const durationInput = el('input');
  durationInput.type = 'number';
  durationInput.min = '5';
  durationInput.value = String(targetSeconds);
  durationInput.title = 'run length in seconds';
  runBtns.append(durationInput);
  panel.append(runBtns);

  section('Frame time (rAF delta)');
  row('refresh', 'display refresh (est.)');
  row('fpsNow', 'fps (last 60 s)');
  row('p50', 'p50 / p95 / p99 ms');
  row('long', 'frames > 20 / 33 / 50 ms');
  row('minfps', 'lowest 60 s window fps');
  row('stalls', 'stalls (page hidden)');
  const histEl = el('div', 'dl-hist');
  panel.append(histEl);

  section('Touch-to-render');
  row('taps', 'taps');
  row('touch', 'p50 / p95 / max ms');
  row('touchSubmit', 'touch to submit p95 ms');

  section('Memory');
  row('heap', 'JS heap now / growth after 1 min');

  section('Audio');
  row('audioState', 'state');
  row('audioLat', 'base / output latency ms');
  row('audioClick', 'click latency est. ms (last)');
  row('audioRec', 'foreground recovery ms (last)');
  const audioBtns = el('div', 'dl-btns');
  panel.append(audioBtns);

  section('Display and safe area');
  row('viewport', 'viewport (dpr)');
  row('orient', 'orientation');
  row('safe', 'safe area t / r / b / l px');
  row('gpu', 'GPU');

  section('WebGL context');
  row('gl', 'lost / restored');
  row('glRestore', 'restore to first draw ms');
  const glBtns = el('div', 'dl-btns');
  panel.append(glBtns);

  section('Determinism (GMR-29 replay)');
  row('det', 'result');
  row('detHash', 'main / moving final hash');
  row('detGolden', 'golden');
  const detBtns = el('div', 'dl-btns');
  panel.append(detBtns);

  section('Verdicts (proposed thresholds)');
  const checksEl = el('div');
  panel.append(checksEl);

  section('Export');
  const exportBtns = el('div', 'dl-btns');
  panel.append(exportBtns);
  const jsonBox = el('textarea', 'dl-json');
  jsonBox.readOnly = true;
  panel.append(jsonBox);

  section('Events');
  const logEl = el('div', 'dl-log');
  panel.append(logEl);

  // --- state --------------------------------------------------------------------------------
  const t0 = performance.now();
  const events: string[] = [];
  const log = (msg: string): void => {
    events.push(`${((performance.now() - t0) / 1000).toFixed(2)}s ${msg}`);
    if (events.length > MAX_EVENTS) events.shift();
  };

  let frames = new FrameStats();
  let runStart = performance.now();
  let finished = false;
  const touchPresented: number[] = [];
  const touchSubmitted: number[] = [];
  let tapCount = 0;
  let pendingTouch: number | null = null;
  let flashTouch: number | null = null;
  let flashFrames = 0;
  let awaitingPresent = false;
  let memory: MemorySample[] = [];
  let memoryEveryMs = 5000;
  let lastMemory = -Infinity;
  let determinism: DeterminismResult | null = null;
  let wakeLock: { release(): Promise<void> } | null = null;
  let raf = 0;
  let stopped = false;
  let last = 0;
  let rendererName = 'unknown';

  const gl = new GlProbe(canvas, (e) => {
    log(`webgl context ${e.kind}`);
  });
  const audio = new AudioProbe(log);
  try {
    const dbg = canvas.getContext('webgl')?.getExtension('WEBGL_debug_renderer_info');
    const ctx = canvas.getContext('webgl');
    if (dbg && ctx) rendererName = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  } catch {
    // Renderer info is optional.
  }
  log(gl.available ? 'webgl available' : 'webgl NOT available');

  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const safeProbe = el('div');
  safeProbe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  host.append(safeProbe);
  const safeArea = (): number[] => {
    const cs = getComputedStyle(safeProbe);
    return [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(
      (v) => parseFloat(v) || 0,
    );
  };

  const orientation = (): string =>
    `${screen.orientation.type} ${String(screen.orientation.angle)} deg`;

  // --- input --------------------------------------------------------------------------------
  const onTouch = (stamp: number): void => {
    tapCount++;
    pendingTouch = stamp;
    hint.style.display = 'none';
    void audio.unlock().catch(() => undefined); // the first gesture also unlocks audio
  };
  canvas.addEventListener(
    'touchstart',
    (e) => {
      onTouch(e.timeStamp);
    },
    { passive: true },
  );
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') onTouch(e.timeStamp); // touch is covered by touchstart
  });

  // --- frame loop ---------------------------------------------------------------------------
  const frame = (ts: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    fit();
    if (last > 0 && !finished) {
      frames.record(ts, ts - last);
    }
    last = ts;

    // Frame N+1 after a flash was submitted: its start approximates when the flash reached the screen.
    if (awaitingPresent && flashTouch !== null) {
      touchPresented.push(ts - flashTouch);
      awaitingPresent = false;
    }
    let flash = false;
    if (pendingTouch !== null) {
      flashTouch = pendingTouch;
      pendingTouch = null;
      flashFrames = TAP_FLASH_FRAMES;
      touchSubmitted.push(performance.now() - flashTouch);
      awaitingPresent = true;
    }
    if (flashFrames > 0) {
      flash = true;
      flashFrames--;
    }
    gl.draw((ts % 1000) / 1000, flash);

    const elapsed = (performance.now() - runStart) / 1000;
    if (!finished && elapsed >= targetSeconds) {
      finished = true;
      log(`run complete after ${elapsed.toFixed(0)} s`);
    }
    if (!finished && performance.now() - lastMemory >= memoryEveryMs) {
      lastMemory = performance.now();
      const mb = readHeapMb();
      if (mb !== null) memory.push({ t: elapsed, usedMb: mb });
    }
  };

  // --- lifecycle events ---------------------------------------------------------------------
  const acquireWakeLock = (): void => {
    const wl = (
      navigator as unknown as {
        wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
      }
    ).wakeLock;
    if (!wl) {
      log('wake lock unsupported: set Auto-Lock / screen timeout to Never');
      return;
    }
    wl.request('screen').then(
      (l) => {
        wakeLock = l;
        log('screen wake lock held');
      },
      () => {
        log('wake lock denied: set Auto-Lock / screen timeout to Never');
      },
    );
  };
  const onVisibility = (): void => {
    const visible = document.visibilityState === 'visible';
    log(`visibility: ${document.visibilityState}`);
    if (visible) {
      void audio.recover();
      acquireWakeLock();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const unsubPlatform = platform.onVisibilityChange((visible) => {
    log(`platform lifecycle: ${visible ? 'foreground' : 'background'}`);
    if (visible) void audio.recover();
  });
  window.addEventListener('pagehide', () => {
    log('pagehide');
  });
  window.addEventListener('pageshow', (e) => {
    log(`pageshow persisted=${String(e.persisted)}`);
  });
  window.addEventListener('resize', () => {
    log(`resize ${String(window.innerWidth)}x${String(window.innerHeight)}`);
  });
  screen.orientation.addEventListener('change', () => {
    log(`orientation: ${orientation()}`);
  });

  // --- buttons ------------------------------------------------------------------------------
  button(runBtns, 'Restart run', () => {
    api.restart(Number(durationInput.value) || targetSeconds);
  });
  button(audioBtns, 'Unlock audio', () => {
    void audio.unlock();
  });
  button(audioBtns, 'Click test', (e) => {
    void audio.click(e.timeStamp);
  });
  button(glBtns, 'Force context loss (1.5 s)', () => {
    if (!gl.forceLose()) log('WEBGL_lose_context unavailable on this device');
    else log('forced webgl context loss');
  });
  button(detBtns, 'Re-run determinism check', () => {
    determinism = runDeterminismCheck();
    log(
      `determinism ${determinism.identical ? 'identical' : 'DIFFERENT'} (${determinism.elapsedMs.toFixed(0)} ms)`,
    );
  });
  button(exportBtns, 'Copy JSON', () => {
    void copyJson();
  });
  button(exportBtns, 'Share JSON', () => {
    void shareJson();
  });

  // --- report -------------------------------------------------------------------------------
  const lastOf = (a: readonly number[]): number | null => a[a.length - 1] ?? null;
  const report = (): LabReport => {
    const sum = frames.summary();
    const elapsed = Math.min(
      (performance.now() - runStart) / 1000,
      finished ? targetSeconds : Infinity,
    );
    const audioInfo = audio.info();
    const growth = heapGrowthMb(memory);
    const checks = evaluate({
      platform: kind,
      frames: sum,
      touchLatenciesMs: touchPresented,
      memory,
      audioClickLatencyMs: audio.clickLatenciesMs.length
        ? samplePercentile(audio.clickLatenciesMs, 50)
        : null,
      audioRecoveryMs: lastOf(audio.recoveryMs),
      webglRestoreMs: gl.restoreToDrawMs,
      deterministic: determinism ? determinism.identical && determinism.framedMatchesDirect : null,
      runSeconds: elapsed,
      targetSeconds,
    });
    return {
      lab: 'device-lab',
      schema: 1,
      build: BUILD_HASH,
      timestamp: new Date().toISOString(),
      device: {
        platform: platform.name,
        kind,
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        viewport: [window.innerWidth, window.innerHeight],
        screen: [screen.width, screen.height],
        orientation: orientation(),
        safeAreaInsetsPx: safeArea(),
        refreshHzEstimate: sum.refreshHzEstimate,
        gpuRenderer: rendererName,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      },
      run: { targetSeconds, elapsedSeconds: elapsed, finished },
      frames: { ...sum, histogramMs: frames.histogram() },
      touch: {
        taps: tapCount,
        measured: touchPresented.length,
        presentedP50Ms: samplePercentile(touchPresented, 50),
        presentedP95Ms: samplePercentile(touchPresented, 95),
        presentedMaxMs: touchPresented.length ? Math.max(...touchPresented) : 0,
        submitP95Ms: samplePercentile(touchSubmitted, 95),
        samplesMs: touchPresented.slice(-200),
      },
      memory: {
        supported: readHeapMb() !== null,
        growthAfterMinuteOneMb: growth,
        samples: memory,
      },
      audio: {
        ...audioInfo,
        clickLatencyEstimatesMs: audio.clickLatenciesMs,
        foregroundRecoveryMs: audio.recoveryMs,
        stateChanges: audio.stateChanges,
      },
      webgl: {
        available: gl.available,
        forceLoseSupported: gl.supportsForceLose,
        lost: gl.lostCount,
        restored: gl.restoredCount,
        restoreToFirstDrawMs: gl.restoreToDrawMs,
      },
      determinism,
      checks,
      events: events.slice(),
    };
  };

  const copyJson = async (): Promise<void> => {
    const text = JSON.stringify(report(), null, 2);
    jsonBox.value = text;
    try {
      await navigator.clipboard.writeText(text);
      log('JSON copied to clipboard');
    } catch {
      jsonBox.select();
      log('clipboard blocked: JSON selected in the box below, copy it manually');
    }
  };
  const shareJson = async (): Promise<void> => {
    const text = JSON.stringify(report());
    jsonBox.value = text;
    const result = await platform.share.shareLink({
      title: `Device lab ${kind} ${BUILD_HASH}`,
      text,
      url: '',
    });
    log(`share: ${result}`);
  };

  // --- periodic UI refresh (not per frame, so the lab does not disturb what it measures) -----
  const f1 = (n: number): string => n.toFixed(1);
  const refreshUi = (): void => {
    const r = report();
    const s = r.frames;
    set('build', BUILD_HASH);
    set('platform', `${platform.name} (${kind})`);
    set(
      'progress',
      `${r.run.elapsedSeconds.toFixed(0)} / ${String(targetSeconds)} s${finished ? ' DONE' : ''}`,
      finished ? 'dl-pass' : undefined,
    );
    set('refresh', `${String(s.refreshHzEstimate)} Hz`);
    set('fpsNow', s.meanMs > 0 ? f1(1000 / s.meanMs) : '-');
    set('p50', `${f1(s.p50Ms)} / ${f1(s.p95Ms)} / ${f1(s.p99Ms)}`);
    set(
      'long',
      `${String(s.over20Ms)} / ${String(s.over33Ms)} / ${String(s.over50Ms)}  (${s.over33Pct.toFixed(3)} % > 33)`,
    );
    set(
      'minfps',
      s.windowFps.length ? f1(s.minWindowFps) : `${f1(s.minWindowFps)} (no full 60 s window yet)`,
    );
    set('stalls', String(s.stalls));
    const hist = frames.histogram();
    const peak = Math.max(1, ...hist);
    histEl.replaceChildren(
      ...hist.map((c, i) => {
        const bar = el('i', i >= 21 ? 'slow' : undefined);
        bar.style.height = `${String(Math.max(2, (c / peak) * 100))}%`;
        bar.title = `${String(i)} ms: ${String(c)}`;
        return bar;
      }),
    );
    const t = r.touch as {
      taps: number;
      presentedP50Ms: number;
      presentedP95Ms: number;
      presentedMaxMs: number;
      submitP95Ms: number;
      measured: number;
    };
    set('taps', `${String(t.taps)} (${String(t.measured)} measured)`);
    set(
      'touch',
      t.measured
        ? `${f1(t.presentedP50Ms)} / ${f1(t.presentedP95Ms)} / ${f1(t.presentedMaxMs)}`
        : '-',
    );
    set('touchSubmit', t.measured ? f1(t.submitP95Ms) : '-');
    const heap = readHeapMb();
    const growth = heapGrowthMb(memory);
    set(
      'heap',
      heap === null
        ? 'n/a here (iOS: use Xcode memory gauge)'
        : `${f1(heap)} MB / ${growth === null ? '-' : f1(growth)} MB`,
    );
    const a = audio.info();
    set('audioState', a.state);
    set(
      'audioLat',
      `${a.baseLatencyMs === null ? '-' : f1(a.baseLatencyMs)} / ${a.outputLatencyMs === null ? 'unknown' : f1(a.outputLatencyMs)}`,
    );
    const lastClick = lastOf(audio.clickLatenciesMs);
    set('audioClick', lastClick === null ? '-' : f1(lastClick));
    const lastRec = lastOf(audio.recoveryMs);
    set('audioRec', lastRec === null ? '-' : f1(lastRec));
    set(
      'viewport',
      `${String(window.innerWidth)}x${String(window.innerHeight)} (${String(window.devicePixelRatio)})`,
    );
    set('orient', orientation());
    set(
      'safe',
      safeArea()
        .map((n) => n.toFixed(0))
        .join(' / '),
    );
    set('gpu', rendererName);
    set(
      'gl',
      `${String(gl.lostCount)} / ${String(gl.restoredCount)}${gl.isLost ? ' (LOST now)' : ''}`,
    );
    set('glRestore', gl.restoreToDrawMs === null ? '-' : f1(gl.restoreToDrawMs));
    if (determinism) {
      set(
        'det',
        determinism.identical ? 'identical to golden' : 'DIFFERENT',
        determinism.identical ? 'dl-pass' : 'dl-fail',
      );
      set('detHash', `${determinism.measured.mainFinal} / ${determinism.measured.movingFinal}`);
      set('detGolden', `${determinism.golden.mainFinal} / ${determinism.golden.movingFinal}`);
    } else {
      set('det', 'running...');
    }
    checksEl.replaceChildren(
      ...r.checks.map((c) => {
        const d = el('div', 'dl-row');
        d.append(el('span', undefined, c.label));
        d.append(
          el(
            'b',
            `dl-${c.verdict === 'n/a' ? 'na' : c.verdict}`,
            `${c.value} [${c.verdict}] ${c.limit}`,
          ),
        );
        return d;
      }),
    );
    logEl.textContent = events.slice(-40).join('\n');
  };
  const uiTimer = window.setInterval(refreshUi, 500);

  // --- start --------------------------------------------------------------------------------
  const api: DeviceLabApi = {
    report,
    restart: (sec) => {
      if (sec !== undefined && sec > 0) targetSeconds = sec;
      durationInput.value = String(targetSeconds);
      frames = new FrameStats();
      memory = [];
      memoryEveryMs = Math.max(5000, (targetSeconds * 1000) / 200);
      lastMemory = -Infinity;
      touchPresented.length = 0;
      touchSubmitted.length = 0;
      finished = false;
      runStart = performance.now();
      last = 0;
      log(`run restarted (${String(targetSeconds)} s)`);
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearInterval(uiTimer);
      unsubPlatform();
      document.removeEventListener('visibilitychange', onVisibility);
      void wakeLock?.release();
      host.remove();
      style.remove();
    },
  };
  memoryEveryMs = Math.max(5000, (targetSeconds * 1000) / 200);
  log(
    `device lab started: ${platform.name}, target ${String(targetSeconds)} s, build ${BUILD_HASH}`,
  );
  acquireWakeLock();
  fit();
  raf = requestAnimationFrame(frame);
  // The replay takes ~0.1 s of CPU: run it once, off the first frames, then again on demand.
  window.setTimeout(() => {
    determinism = runDeterminismCheck();
    log(
      `determinism ${determinism.identical ? 'identical' : 'DIFFERENT'} (${determinism.elapsedMs.toFixed(0)} ms)`,
    );
  }, 800);
  refreshUi();
  (window as unknown as { __deviceLab: DeviceLabApi }).__deviceLab = api;
  return api;
}
