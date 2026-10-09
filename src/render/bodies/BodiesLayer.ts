import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { DeathRecord, LevelDef } from '../../sim';
import { hash, strokeInk, wobble, type Pt } from '../ink';
import { BodyPile } from './BodyPile';
import { bodyPoint, HEAD, HEAD_R, LIMBS, NECK, type Ragdoll } from './ragdoll';
import { drawEraser } from './eraser';

const INK = 0x16161a;
const PENCIL = 0x8a8a8a;
/** Translucent pencil: bodies stay well below the live hero, ghost and gameplay marks. */
export const BODY_ALPHA = 0.35;
/** Above the paper (-100), under the baked level art (-50) and everything dynamic. */
const BODY_DEPTH = -60;
const POP_TIME = 0.12;
const CLEAR_TIME = 0.25;
const SWEEP_TIME = 1.1;
const FADE_SWEEP_TIME = 0.2;
const SMUDGE_TIME = 1.5;

export interface BodiesStats {
  readonly count: number;
  readonly simulating: number;
  readonly visible: boolean;
  readonly sweeping: boolean;
  readonly clearing: boolean;
}

interface Smudge {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly seed: number;
  age: number;
}

/**
 * Death bodies on screen (GMR-104): translucent ragdolls where the hero died. Settling bodies are
 * redrawn each frame; frozen ones are baked once into a small RenderTexture, so a full pile costs
 * a few quads. B shows/hides with a pop, C scribbles them out, and an eraser sweep rubs them out
 * when the level is completed. Presentation only: nothing here reaches the simulation.
 */
export class BodiesLayer {
  readonly pile: BodyPile;
  private readonly live: Phaser.GameObjects.Graphics;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly smudgeG: Phaser.GameObjects.Graphics;
  private readonly eraserG: Phaser.GameObjects.Graphics;
  private readonly baked = new Map<number, Phaser.GameObjects.RenderTexture>();
  private shown: boolean;
  private pop: number;
  private clearT: number | null = null;
  private sweep: { t: number; done: () => void; touched: Set<number> } | null = null;
  private smudges: Smudge[] = [];
  private readonly skip = (e: Event): void => {
    if (e instanceof KeyboardEvent && e.repeat) return;
    this.finishSweep();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    level: LevelDef,
    gravity: number,
    visible: boolean,
    private readonly reducedMotion: () => boolean,
    private readonly lineScale: () => number,
  ) {
    this.pile = new BodyPile(level, gravity);
    this.shown = visible;
    this.pop = visible ? 1 : 0;
    this.smudgeG = scene.add.graphics().setDepth(BODY_DEPTH + 1);
    this.live = scene.add.graphics().setDepth(BODY_DEPTH).setAlpha(BODY_ALPHA);
    this.fx = scene.add.graphics().setDepth(-45);
    this.eraserG = scene.add.graphics().setScrollFactor(0).setDepth(95);
  }

  get visible(): boolean {
    return this.shown;
  }

  get sweeping(): boolean {
    return this.sweep !== null;
  }

  stats(): BodiesStats {
    return {
      count: this.pile.kept,
      simulating: this.pile.simulating,
      visible: this.shown,
      sweeping: this.sweep !== null,
      clearing: this.clearT !== null,
    };
  }

  onDeath(death: Pick<DeathRecord, 'tick' | 'at' | 'velocity'>): void {
    if (this.sweep) return;
    this.pile.spawn(death);
  }

  /** B: snap the bodies in or out (a quick scale pop; instant with reduced motion). */
  setVisible(on: boolean): void {
    this.shown = on;
    if (this.reducedMotion()) this.pop = on ? 1 : 0;
  }

  /** C: a quick pencil scribble over every body, then they are gone. */
  clear(): void {
    if (this.sweep || this.clearT !== null) return;
    if (!this.shown || this.pile.bodies.length === 0) {
      this.removeAll();
      return;
    }
    this.pile.freezeAll();
    this.clearT = 0;
  }

  /**
   * Level complete: rub out the visible bodies with the eraser, then call `done`. Calls `done`
   * straight away when there is nothing to erase. Any key or tap skips the sweep.
   */
  erase(done: () => void): void {
    if (this.sweep) return;
    if (!this.shown || this.pile.kept === 0) {
      this.removeAll();
      done();
      return;
    }
    this.clearT = null;
    this.pile.freezeAll();
    this.sweep = { t: 0, done, touched: new Set() };
    this.listen(true);
  }

  update(dt: number): void {
    this.pile.step(dt);
    const target = this.shown ? 1 : 0;
    this.pop += Math.sign(target - this.pop) * Math.min(Math.abs(target - this.pop), dt / POP_TIME);
    const scale = this.shown ? popIn(this.pop) : this.pop * this.pop;
    let fade = 1;
    if (this.clearT !== null) {
      this.clearT += dt;
      fade = Math.max(0, 1 - this.clearT / CLEAR_TIME);
    }
    if (this.sweep && this.reducedMotion()) fade = Math.max(0, 1 - this.sweep.t / FADE_SWEEP_TIME);
    this.syncBaked(scale, fade);
    this.drawLive(scale);
    this.drawClearScribble();
    this.updateSweep(dt);
    this.drawSmudges(dt);
    if (this.clearT !== null && this.clearT >= CLEAR_TIME) {
      this.clearT = null;
      this.removeAll();
    }
  }

  destroy(): void {
    if (this.sweep) this.listen(false);
    this.sweep = null;
    this.removeAll();
  }

  private listen(on: boolean): void {
    for (const type of ['keydown', 'pointerdown'] as const) {
      if (on) window.addEventListener(type, this.skip);
      else window.removeEventListener(type, this.skip);
    }
  }

  // --- drawing -----------------------------------------------------------------------------------

  private syncBaked(scale: number, fade: number): void {
    const ids = new Set<number>();
    for (const b of this.pile.bodies) {
      ids.add(b.id);
      let rt = this.baked.get(b.id);
      if (!rt && b.rag.frozen) {
        rt = this.bake(b.rag);
        this.baked.set(b.id, rt);
      }
      rt?.setScale(scale)
        .setAlpha(BODY_ALPHA * b.fade * fade)
        .setVisible(scale > 0.01);
    }
    for (const [id, rt] of this.baked) {
      if (ids.has(id)) continue;
      rt.destroy();
      this.baked.delete(id);
    }
  }

  private bake(rd: Ragdoll): Phaser.GameObjects.RenderTexture {
    const box = bounds(rd);
    const g = this.scene.add.graphics();
    drawBody(g, rd, this.lineScale());
    const rt = this.scene.add
      .renderTexture(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h)
      .setOrigin(0.5)
      .setDepth(BODY_DEPTH);
    rt.draw(g, -box.x, -box.y);
    rt.render();
    g.destroy();
    return rt;
  }

  private drawLive(scale: number): void {
    const g = this.live;
    g.clear();
    if (scale <= 0.01) return;
    for (const b of this.pile.bodies) {
      if (b.rag.frozen) continue;
      const neck = bodyPoint(b.rag, NECK);
      const c = { x: m(neck.x), y: m(neck.y) };
      g.save();
      g.translateCanvas(c.x, c.y);
      g.scaleCanvas(scale, scale);
      g.translateCanvas(-c.x, -c.y);
      drawBody(g, b.rag, this.lineScale());
      g.restore();
    }
  }

  private drawClearScribble(): void {
    const g = this.fx;
    g.clear();
    if (this.clearT === null || this.reducedMotion()) return;
    const k = Math.min(1, this.clearT / CLEAR_TIME);
    for (const b of this.pile.bodies) {
      const box = bounds(b.rag);
      const pts: Pt[] = [];
      const n = 9;
      const upto = Math.max(2, Math.ceil(n * k * 1.4));
      for (let i = 0; i < Math.min(n, upto); i++) {
        const t = i / (n - 1);
        pts.push({
          x: box.x + box.w * (i % 2 === 0 ? 0.15 : 0.85) + (hash(b.id + i) - 0.5) * 6,
          y: box.y + box.h * (0.1 + 0.8 * t),
        });
      }
      strokeInk(
        g,
        wobble(pts, b.id, 1.5, 12),
        2.2 * this.lineScale(),
        INK,
        0.7 * (1 - k * 0.6),
        b.id,
      );
    }
  }

  private updateSweep(dt: number): void {
    const g = this.eraserG;
    g.clear();
    const sw = this.sweep;
    if (!sw) return;
    sw.t += dt;
    if (this.reducedMotion()) {
      if (sw.t >= FADE_SWEEP_TIME) this.finishSweep();
      return;
    }
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const e = Math.min(1, sw.t / SWEEP_TIME);
    const ease = e * e * (3 - 2 * e);
    const sx = -0.2 * W + 1.4 * W * ease;
    const phase = sw.t * Math.PI * 2 * 4.5;
    const sy = H * 0.5 + Math.sin(phase) * H * 0.32;
    const size = Math.max(70, Math.min(150, W * 0.1));
    drawEraser(g, sx, sy, size, Math.cos(phase) * 0.22 - 0.12);
    // Rub out everything left of the eraser's trailing edge (it scrubs the full height).
    const cam = this.scene.cameras.main;
    const worldX = cam.worldView.x + (sx - size * 0.3) / cam.zoom;
    for (const b of this.pile.bodies) {
      const rt = this.baked.get(b.id);
      if (!rt) continue;
      const left = rt.x - rt.width / 2;
      const cut = Math.max(0, Math.min(rt.width, worldX - left));
      if (cut <= 0) continue;
      if (!sw.touched.has(b.id)) {
        sw.touched.add(b.id);
        this.smudges.push({ x: left, y: rt.y, w: rt.width, seed: b.id, age: 0 });
      }
      rt.setCrop(cut, 0, rt.width - cut, rt.height).setVisible(cut < rt.width);
    }
    if (e >= 1) this.finishSweep();
  }

  private finishSweep(): void {
    const sw = this.sweep;
    if (!sw) return;
    this.sweep = null;
    this.listen(false);
    this.eraserG.clear();
    this.removeAll();
    sw.done();
  }

  /** Faint graphite smudges where the eraser passed; they fade out. */
  private drawSmudges(dt: number): void {
    const g = this.smudgeG;
    g.clear();
    this.smudges = this.smudges.filter((s) => (s.age += dt) < SMUDGE_TIME);
    for (const s of this.smudges) {
      const a = 0.22 * (1 - s.age / SMUDGE_TIME);
      for (let k = 0; k < 3; k++) {
        const y = s.y + (k - 1) * m(0.12) + (hash(s.seed + k) - 0.5) * m(0.1);
        const pts = [
          { x: s.x + s.w * 0.15, y },
          { x: s.x + s.w * 0.85, y: y + (hash(s.seed + k + 0.5) - 0.5) * m(0.15) },
        ];
        strokeInk(g, wobble(pts, s.seed + k, 2, 10), m(0.09), PENCIL, a, s.seed + k);
      }
    }
  }

  private removeAll(): void {
    this.pile.clear();
    for (const rt of this.baked.values()) rt.destroy();
    this.baked.clear();
    this.live.clear();
    this.fx.clear();
  }
}

/** Ease-out with a small overshoot: the pop. */
function popIn(p: number): number {
  const s = 1.7;
  const t = p - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

function bounds(rd: Ragdoll): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of rd.points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const pad = HEAD_R * 1.15 + 0.08;
  const x = Math.floor(m(x0 - pad));
  const y = Math.floor(m(y0 - pad));
  return { x, y, w: Math.ceil(m(x1 + pad)) - x, h: Math.ceil(m(y1 + pad)) - y };
}

/**
 * The body in the hero's line style (drawHero): single-line limbs, round hands, black boots and
 * the lumpy skull head, here with crossed-out eyes. Drawn opaque; the layer applies the alpha.
 */
export function drawBody(g: Phaser.GameObjects.Graphics, rd: Ragdoll, L: number): void {
  const P = (i: number): Pt => {
    const p = bodyPoint(rd, i);
    return { x: m(p.x), y: m(p.y) };
  };
  const w = 1.3 * L;
  LIMBS.forEach((chain, k) => {
    strokeInk(g, chain.map(P), (k === 0 ? 2.6 : 2.4) * w, INK, 1, rd.seed % 97);
  });
  g.fillStyle(INK, 1);
  for (const i of [8, 10]) {
    const h = P(i);
    g.fillCircle(h.x, h.y, m(0.036) * Math.max(1, L * 0.8));
  }
  for (const i of [4, 6]) {
    const f = P(i);
    g.fillEllipse(f.x, f.y, m(0.12), m(0.075));
  }
  const head = P(HEAD);
  const neck = P(NECK);
  const ul = Math.hypot(head.x - neck.x, head.y - neck.y) || 1;
  const up = { x: (head.x - neck.x) / ul, y: (head.y - neck.y) / ul };
  const fwd = { x: -up.y * rd.facing, y: up.x * rd.facing };
  const r = m(HEAD_R);
  const ring: Pt[] = [];
  for (let k = 0; k <= 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const lump = 1 + 0.035 * Math.sin(a * 3 + 0.7) + 0.02 * Math.sin(a * 5);
    ring.push({ x: head.x + Math.cos(a) * r * lump, y: head.y + Math.sin(a) * r * lump });
  }
  strokeInk(g, ring, 2.7 * w, INK, 1, rd.seed % 89);
  // Crossed-out eyes, looking the way the body faced.
  g.lineStyle(1.8 * w, INK, 1);
  const e = m(0.04);
  for (const along of [0.03, 0.14]) {
    const cx = head.x + fwd.x * m(along) + up.x * m(0.03);
    const cy = head.y + fwd.y * m(along) + up.y * m(0.03);
    g.lineBetween(cx - e, cy - e, cx + e, cy + e);
    g.lineBetween(cx - e, cy + e, cx + e, cy - e);
  }
}
