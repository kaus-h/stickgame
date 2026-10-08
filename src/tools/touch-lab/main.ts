import runtimeTuning from '../../../content/tuning/runtime.json';
import { parseRuntimeTuning } from '../../content';
import {
  ASSIST_MODES,
  BUILD_HASH,
  parseAssistMode,
  vec2,
  type AssistMode,
  type Intent,
  type Vec2,
} from '../../core';
import {
  bindTouchDom,
  TOUCH_SCHEMES,
  TouchInputMapper,
  type MoveStyle,
  type SafeAreaInsets,
  type TouchScheme,
} from '../../input';
import { cameraScale, DEFAULT_CAMERA } from '../../render/camera';
import { AcquisitionSession, generateTrials, type LabRunExport } from './session';

/**
 * Touch lab (GMR-27): a target-acquisition test per control scheme, for phones and the Capacitor
 * shell. Same touch mapper, same selection rule (resolveTarget + assist) and the same world scale
 * as the game on this viewport; no Phaser so it loads fast on any device.
 * URL: /touch-lab.html?scheme=drag-aim&assist=snap&move=analog&trials=20&seed=27
 */

const tuning = parseRuntimeTuning(runtimeTuning);
const params = new URLSearchParams(window.location.search);
const PAPER = '#f3efe6';
const INK = '#16161a';
const PENCIL = '#8a8a8a';
const RED = '#c5302a';
const HIGHLIGHT = 'rgba(255, 225, 74, 0.6)';
const GAP_MS = 350;

const canvas = document.getElementById('lab') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const panel = document.getElementById('panel') as HTMLDivElement;
const out = document.getElementById('out') as HTMLTextAreaElement;
const summaryEl = document.getElementById('summary') as HTMLPreElement;
const sel = (id: string) => document.getElementById(id) as HTMLSelectElement;
const inp = (id: string) => document.getElementById(id) as HTMLInputElement;

fill(
  sel('scheme'),
  TOUCH_SCHEMES,
  TOUCH_SCHEMES.find((s) => s === params.get('scheme')) ?? 'direct-touch',
);
fill(sel('move'), ['digital', 'analog'], params.get('move') === 'analog' ? 'analog' : 'digital');
fill(sel('assist'), ASSIST_MODES, parseAssistMode(params.get('assist')) ?? 'standard');
inp('trials').value = params.get('trials') ?? '20';
inp('seed').value = params.get('seed') ?? '27';

let width = 0;
let height = 0;
let pxPerM = 32;
let aim: Vec2 | null = null;
let session: AcquisitionSession | null = null;
let nextAt = 0;
let lastPress: { at: Vec2; hit: boolean; t: number } | null = null;
const runs: LabRunExport[] = [];

const toWorld = (x: number, y: number): Vec2 => vec2(x / pxPerM, y / pxPerM);
const toScreen = (p: Vec2): Vec2 => vec2(p.x * pxPerM, p.y * pxPerM);
const player = (): Vec2 => toWorld(width * 0.3, height * 0.72);

const mapper = new TouchInputMapper(onIntent, toWorld, { scheme: 'direct-touch' });
mapper.activate();

function onIntent(intent: Intent): void {
  if (intent.type === 'ropeAim') aim = intent.target;
  if (intent.type === 'ropePress' && session?.active && aim) {
    const now = performance.now();
    const press = session.press(now, aim, mapper.state().touches);
    if (press) lastPress = { at: aim, hit: press.selected === 'target', t: now };
    if (press?.selected === 'target') nextAt = now + GAP_MS;
  }
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${String(width)}px`;
  canvas.style.height = `${String(height)}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pxPerM = cameraScale(width, height, DEFAULT_CAMERA);
  mapper.setViewport(width, height, readSafeArea());
}

function start(): void {
  const scheme = sel('scheme').value as TouchScheme;
  const moveStyle = sel('move').value as MoveStyle;
  const assist: AssistMode = parseAssistMode(sel('assist').value) ?? 'standard';
  const seed = Math.max(0, Math.floor(Number(inp('seed').value) || 0));
  const count = Math.max(1, Math.min(200, Math.floor(Number(inp('trials').value) || 20)));
  mapper.blur();
  mapper.setScheme(scheme);
  mapper.setMoveStyle(moveStyle);
  const layout = mapper.layout();
  const r = 0.4;
  const avoid = (p: Vec2): boolean => {
    const s = toScreen(p);
    const z = layout.moveZone;
    if (s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0) return true;
    if (layout.controls.some((c) => Math.hypot(s.x - c.x, s.y - c.y) < c.hit + r * pxPerM + 12))
      return true;
    const pl = player();
    return Math.hypot(p.x - pl.x, p.y - pl.y) < 1.5;
  };
  const tl = toWorld(width * 0.08, height * 0.08);
  const br = toWorld(width * 0.94, height * 0.66);
  const specs = generateTrials(seed, count, { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y }, avoid);
  session = new AcquisitionSession(
    {
      scheme,
      moveStyle,
      assist: { mode: assist, ...tuning.assist },
      rope: { ...tuning.sim.rope, minLength: 0, maxLength: Number.MAX_VALUE },
      anchorRadius: r,
      pxPerM,
      occlusionPx: Math.max(8, Number(inp('occlusion').value) || 24),
      timeoutMs: 6000,
      worldToScreen: toScreen,
    },
    specs,
    player(),
  );
  sessionMeta = { scheme, moveStyle, assist, seed };
  nextAt = performance.now() + 600;
  panel.style.display = 'none';
}

let sessionMeta: {
  scheme: TouchScheme;
  moveStyle: MoveStyle;
  assist: AssistMode;
  seed: number;
} | null = null;

function finishRun(): void {
  if (!session || !sessionMeta) return;
  runs.push({ ...sessionMeta, summary: session.summary(), trials: session.results() });
  session = null;
  mapper.blur();
  panel.style.display = '';
  summaryEl.textContent = runs
    .map((r) => {
      const s = r.summary;
      const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d));
      return `${r.scheme}/${r.moveStyle}/${r.assist}: ${String(s.acquired)}/${String(s.trials)} acquired, median ${f(s.medianAcquisitionMs)} ms, p90 ${f(s.p90AcquisitionMs)} ms, err ${f(s.meanErrorPx, 1)} px, miss ${(s.missRate * 100).toFixed(0)}%, occl ${(s.occlusionRate * 100).toFixed(0)}%, snap ${(s.snapRate * 100).toFixed(0)}%`;
    })
    .join('\n');
  out.value = JSON.stringify(exportAll(), null, 2);
}

function exportAll() {
  return {
    tool: 'touch-lab',
    version: 1,
    build: BUILD_HASH,
    recordedAt: new Date().toISOString(),
    device: {
      userAgent: navigator.userAgent,
      viewport: { width, height },
      devicePixelRatio: window.devicePixelRatio || 1,
      safeArea: readSafeArea(),
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
    },
    pxPerM,
    assistTuning: tuning.assist,
    selectRadius: tuning.sim.rope.selectRadius,
    runs,
  };
}

function download(): void {
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `touch-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function frame(now: number): void {
  mapper.beforeTick();
  if (session) {
    const wasActive = session.active !== null;
    session.tick(now);
    if (wasActive && !session.active) nextAt = Math.max(nextAt, now + GAP_MS); // timed out
    if (!session.active && now >= nextAt && !session.begin(now)) finishRun();
  }
  draw(now);
  requestAnimationFrame(frame);
}

function draw(now: number): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(158, 194, 223, 0.5)';
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += pxPerM * 0.5) line(0, y, width, y);

  const pl = toScreen(player());
  ctx.fillStyle = INK;
  circle(pl.x, pl.y, 0.35 * pxPerM, true);

  const spec = session?.active;
  if (spec) {
    for (const d of spec.decoys) ring(toScreen(d), 0.4 * pxPerM, INK, 3);
    const t = toScreen(spec.target);
    ring(t, 0.4 * pxPerM, INK, 3);
    ring(t, 0.4 * pxPerM + 7, RED, 2);
  }
  if (aim) {
    const a = toScreen(aim);
    ring(a, 0.18 * pxPerM, PENCIL, 1.6);
  }
  if (lastPress && now - lastPress.t < 400) {
    const a = toScreen(lastPress.at);
    ring(a, 10 + (now - lastPress.t) / 20, lastPress.hit ? INK : RED, 2);
  }

  const st = mapper.state();
  for (const c of st.controls) {
    if (c.pressed) {
      ctx.fillStyle = HIGHLIGHT;
      circle(c.x, c.y, c.r * 0.92, true);
    }
    ring(c, c.r, c.pressed ? INK : PENCIL, c.pressed ? 3 : 2);
    if (c.knob) ring(c.knob, c.r * 0.42, c.pressed ? INK : PENCIL, 2);
    ctx.fillStyle = c.pressed ? INK : PENCIL;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(c.id, c.x, c.y + 4);
  }
  if (st.reticle) {
    if (st.leaderFrom) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = PENCIL;
      ctx.lineWidth = 1.4;
      line(st.leaderFrom.x, st.leaderFrom.y, st.reticle.x, st.reticle.y);
      ctx.setLineDash([]);
    }
    ring(st.reticle, 12, INK, 1.8);
  }
  for (const t of st.touches)
    ring(t, Number(inp('occlusion').value) || 24, 'rgba(22,22,26,0.25)', 1);

  ctx.fillStyle = INK;
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  const s = session;
  if (s) {
    const n = s.results().length + (s.active ? 1 : 0);
    ctx.fillText(
      `${sessionMeta?.scheme ?? ''} · ${sessionMeta?.assist ?? ''}  trial ${String(n)}/${String(s.specs.length)}  (hit the red-ringed anchor)`,
      12,
      20,
    );
  }
}

function ring(
  c: { readonly x: number; readonly y: number },
  r: number,
  color: string,
  w: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  circle(c.x, c.y, r, false);
}

function circle(x: number, y: number, r: number, filled: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (filled) ctx.fill();
  else ctx.stroke();
}

function line(x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function fill(el: HTMLSelectElement, values: readonly string[], value: string): void {
  for (const v of values) el.add(new Option(v, v, v === value, v === value));
}

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

resize();
window.addEventListener('resize', resize);
bindTouchDom(canvas, mapper);
// ?mouse=1: drive the lab with a mouse as one touch (desktop sanity checks only, not data).
if (params.get('mouse') === '1') {
  const local = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    const p = local(e);
    mapper.pointerDown(-1, p.x, p.y);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = local(e);
    mapper.pointerMove(-1, p.x, p.y);
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') mapper.pointerUp(-1);
  });
}
(document.getElementById('start') as HTMLButtonElement).addEventListener('click', start);
(document.getElementById('export') as HTMLButtonElement).addEventListener('click', download);
requestAnimationFrame(frame);

// Automation hook (e2e and remote device runs).
Object.assign(window, {
  __touchLab: {
    start,
    exportAll,
    runs,
    active: () => session?.active ?? null,
    toScreen: (x: number, y: number) => toScreen(vec2(x, y)),
    state: () => mapper.state(),
  },
});
