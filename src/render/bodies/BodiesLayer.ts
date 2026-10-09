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
/** One shared frozen-body texture: 128 slots of 128 px, large enough for normal hero bounds. */
const ATLAS_CELL = 128;
const ATLAS_COLUMNS = 16;
const ATLAS_ROWS = 8;
const ATLAS_SLOTS = ATLAS_COLUMNS * ATLAS_ROWS;
const COMPOSITE_TILE = 1024;

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

interface BakedBody {
  readonly image: Phaser.GameObjects.Image;
  readonly slot?: number;
  readonly frame?: string;
}

/**
 * Death bodies on screen (GMR-104): translucent ragdolls where the hero died. Settling bodies are
 * redrawn each frame; frozen ones are baked into frames of one shared RenderTexture atlas. B
 * shows/hides with a pop, C scribbles them out, and an eraser sweep rubs them out when the level
 * is completed. Presentation only: nothing here reaches the simulation.
 */
export class BodiesLayer {
  readonly pile: BodyPile;
  private readonly live: Phaser.GameObjects.Graphics;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly smudgeG: Phaser.GameObjects.Graphics;
  private readonly eraserG: Phaser.GameObjects.Graphics;
  private readonly baked = new Map<number, BakedBody>();
  private readonly composites = new Map<string, Phaser.GameObjects.RenderTexture>();
  private readonly freeSlots = Array.from({ length: ATLAS_SLOTS }, (_, i) => ATLAS_SLOTS - i - 1);
  private atlas: Phaser.GameObjects.RenderTexture | null = null;
  private compositeSignature = '';
  private compositeMode = false;
  private liveCompositeMode = false;
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
    if (this.pile.kept === 0) {
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
    const compositesActive = this.syncSettledComposites(scale);
    this.syncBaked(scale, fade, compositesActive);
    this.drawLive(scale, compositesActive);
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
    this.live.destroy();
    this.fx.destroy();
    this.smudgeG.destroy();
    this.eraserG.destroy();
  }

  private listen(on: boolean): void {
    for (const type of ['keydown', 'pointerdown'] as const) {
      if (on) window.addEventListener(type, this.skip);
      else window.removeEventListener(type, this.skip);
    }
  }

  // --- drawing -----------------------------------------------------------------------------------

  private syncSettledComposites(scale: number): boolean {
    const bodies = this.pile.bodies;
    const signature = bodies.map((body) => String(body.id)).join(',');
    if (signature !== this.compositeSignature) this.clearComposites();
    const eligible =
      this.shown &&
      this.pop >= 1 &&
      scale === 1 &&
      this.clearT === null &&
      this.sweep === null &&
      bodies.length > 0 &&
      bodies.every((body) => body.rag.frozen && !body.fading);
    if (!eligible) {
      for (const composite of this.composites.values()) composite.setVisible(false);
      return false;
    }

    if (signature !== this.compositeSignature) {
      this.clearComposites();
      const groups = new Map<string, typeof bodies>();
      for (const body of bodies) {
        const box = bounds(body.rag);
        const tileX = Math.floor((box.x + box.w / 2) / COMPOSITE_TILE);
        const tileY = Math.floor((box.y + box.h / 2) / COMPOSITE_TILE);
        const key = `${String(tileX)},${String(tileY)}`;
        const group = groups.get(key);
        if (group) group.push(body);
        else groups.set(key, [body]);
      }

      for (const [key, group] of groups) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const body of group) {
          const box = bounds(body.rag);
          x0 = Math.min(x0, box.x);
          y0 = Math.min(y0, box.y);
          x1 = Math.max(x1, box.x + box.w);
          y1 = Math.max(y1, box.y + box.h);
        }
        const g = this.scene.add.graphics();
        for (const body of group) drawBody(g, body.rag, this.lineScale());
        // Flatten overlaps into one opaque pencil layer, then apply the normal 35% body alpha once.
        const composite = this.scene.add
          .renderTexture((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0)
          .setOrigin(0.5)
          .setDepth(BODY_DEPTH)
          .setAlpha(BODY_ALPHA);
        composite.draw(g, -x0, -y0);
        composite.render();
        composite.setVisible(true);
        g.destroy();
        this.composites.set(key, composite);
      }
      this.compositeSignature = signature;
    } else {
      for (const composite of this.composites.values()) composite.setVisible(true);
    }
    return this.composites.size > 0;
  }

  private clearComposites(): void {
    for (const composite of this.composites.values()) composite.destroy();
    this.composites.clear();
    this.compositeSignature = '';
  }

  private syncBaked(scale: number, fade: number, compositesActive: boolean): void {
    if (compositesActive) {
      if (!this.compositeMode) {
        for (const baked of this.baked.values()) baked.image.setVisible(false);
      }
      this.compositeMode = true;
      return;
    }
    this.compositeMode = false;

    const ids = new Set<number>();
    for (const b of this.pile.bodies) {
      ids.add(b.id);
      let baked: BakedBody | null | undefined = this.baked.get(b.id);
      if (!baked && b.rag.frozen) {
        baked = this.bake(b.rag);
        if (baked) this.baked.set(b.id, baked);
      }
      if (baked) {
        baked.image
          .setScale(scale)
          .setAlpha(BODY_ALPHA * b.fade * fade)
          .setVisible(scale > 0.01);
      }
    }
    for (const [id, baked] of this.baked) {
      if (ids.has(id)) continue;
      this.releaseBake(baked);
      this.baked.delete(id);
    }
  }

  private bake(rd: Ragdoll): BakedBody | null {
    const box = bounds(rd);
    const g = this.scene.add.graphics();
    drawBody(g, rd, this.lineScale());
    if (box.w <= ATLAS_CELL && box.h <= ATLAS_CELL && this.freeSlots.length > 0) {
      const slot = this.freeSlots.pop() as number;
      const x = (slot % ATLAS_COLUMNS) * ATLAS_CELL;
      const y = Math.floor(slot / ATLAS_COLUMNS) * ATLAS_CELL;
      const atlas = this.ensureAtlas();
      const frame = `body-${String(slot)}`;
      atlas.draw(g, x - box.x, y - box.y);
      atlas.render();
      atlas.texture.add(frame, 0, x, y, box.w, box.h);
      const image = this.scene.add
        .image(box.x + box.w / 2, box.y + box.h / 2, atlas.texture, frame)
        .setOrigin(0.5)
        .setDepth(BODY_DEPTH);
      g.destroy();
      return { image, slot, frame };
    }

    if (box.w <= ATLAS_CELL && box.h <= ATLAS_CELL) {
      // The atlas is intentionally bounded. If every cell is occupied, keep this body in the
      // live overlay until fading bodies release cells rather than allocating another texture.
      g.destroy();
      return null;
    }

    // Keep unusual oversized poses visible without changing their scale or drawing bounds.
    const rt = this.scene.add
      .renderTexture(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h)
      .setOrigin(0.5)
      .setDepth(BODY_DEPTH);
    rt.draw(g, -box.x, -box.y);
    rt.render();
    g.destroy();
    return { image: rt };
  }

  private ensureAtlas(): Phaser.GameObjects.RenderTexture {
    if (!this.atlas) {
      this.atlas = this.scene.add
        .renderTexture(0, 0, ATLAS_CELL * ATLAS_COLUMNS, ATLAS_CELL * ATLAS_ROWS)
        .setVisible(false);
    }
    return this.atlas;
  }

  private releaseBake(baked: BakedBody): void {
    baked.image.destroy();
    if (baked.slot === undefined || baked.frame === undefined || !this.atlas) return;
    const x = (baked.slot % ATLAS_COLUMNS) * ATLAS_CELL;
    const y = Math.floor(baked.slot / ATLAS_COLUMNS) * ATLAS_CELL;
    this.atlas.texture.remove(baked.frame);
    this.atlas.clear(x, y, ATLAS_CELL, ATLAS_CELL);
    this.freeSlots.push(baked.slot);
  }

  private drawLive(scale: number, compositesActive: boolean): void {
    const g = this.live;
    if (compositesActive) {
      if (!this.liveCompositeMode) g.clear();
      this.liveCompositeMode = true;
      return;
    }
    this.liveCompositeMode = false;
    g.clear();
    if (scale <= 0.01) return;
    for (const b of this.pile.bodies) {
      if (b.rag.frozen && this.baked.has(b.id)) continue;
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
      const baked = this.baked.get(b.id);
      if (!baked) continue;
      const image = baked.image;
      const left = image.x - image.width * image.originX;
      const cut = Math.max(0, Math.min(image.width, worldX - left));
      if (cut <= 0) continue;
      if (!sw.touched.has(b.id)) {
        sw.touched.add(b.id);
        this.smudges.push({
          x: left,
          y: image.y - image.height * image.originY,
          w: image.width,
          seed: b.id,
          age: 0,
        });
      }
      image.setCrop(cut, 0, image.width - cut, image.height).setVisible(cut < image.width);
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
    this.clearComposites();
    for (const baked of this.baked.values()) this.releaseBake(baked);
    this.baked.clear();
    this.atlas?.destroy();
    this.atlas = null;
    this.compositeMode = false;
    this.liveCompositeMode = false;
    this.freeSlots.length = 0;
    for (let i = ATLAS_SLOTS - 1; i >= 0; i--) this.freeSlots.push(i);
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
