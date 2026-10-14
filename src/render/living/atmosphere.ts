import type * as Phaser from 'phaser';
import { hash, strokeInk, wobble, type Pt } from '../ink';
import { HAND_FONT } from '../typeface';

const GRAPHITE = 0x3a3630;
const INK = '#16161a';

/**
 * Graphite dust in the lamplight (owner playtest 2026-10-12: atmosphere). A few specks hang in the
 * air above the page, drifting and turning slowly, a little nearer the eye than the paper so they
 * slide against it as the camera moves. Screen-space presentation only; off under reduced motion.
 */
export class DustMotes {
  private readonly g: Phaser.GameObjects.Graphics;
  private clock = 0;
  private static readonly COUNT = 16;

  constructor(
    scene: Phaser.Scene,
    depth: number,
    private readonly calm: boolean,
    /** Speck colour: graphite by default; a pale grey where dust catches light shafts. */
    private readonly color: number = GRAPHITE,
    private readonly strength = 1,
  ) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  update(dt: number, scrollX: number, scrollY: number, width: number, height: number): void {
    const g = this.g;
    g.clear();
    if (this.calm) return;
    this.clock += dt;
    const t = this.clock;
    for (let i = 0; i < DustMotes.COUNT; i++) {
      const depth = 0.12 + 0.3 * hash(i * 7.1); // parallax: nearer specks slide more
      const speed = 4 + 9 * hash(i * 3.3);
      const wrapW = width + 80,
        wrapH = height + 80;
      const x0 = hash(i * 1.9) * wrapW + t * speed * 0.6 - scrollX * depth;
      const y0 = hash(i * 5.7) * wrapH - t * speed * 0.35 - scrollY * depth;
      const x = (((x0 % wrapW) + wrapW) % wrapW) - 40 + Math.sin(t * 0.5 + i) * 6;
      const y = (((y0 % wrapH) + wrapH) % wrapH) - 40 + Math.cos(t * 0.37 + i * 1.3) * 5;
      // Specks twinkle as they turn in the light.
      const turn = 0.5 + 0.5 * Math.sin(t * (0.8 + hash(i) * 1.4) + i * 2.1);
      const r = 0.7 + 1.3 * hash(i * 9.1);
      g.fillStyle(this.color, (0.08 + 0.17 * turn) * this.strength).fillCircle(x, y, r);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

const WRITE_NUMBER = 0.45;
const WRITE_NAME = 0.6;
const UNDERLINE = 0.25;
// Gone by about two seconds in: the first anchors live in this sky.
const HOLD = 0.5;
const FADE = 0.45;

/**
 * The level's title, written onto the page as it opens: the number, then the name, then a quick
 * underline, held a moment and faded. Only on first entry (never between death and retry), never
 * blocks input, and reduced motion shows it whole and fades it. Chapter levels only.
 */
export class LevelTitleCard {
  private readonly number: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly line: Phaser.GameObjects.Graphics;
  private clock = 0;
  private done = false;

  static shouldShow(levelId: string): boolean {
    return /^\d+-\d+$/.test(levelId);
  }

  constructor(
    scene: Phaser.Scene,
    label: string,
    title: string,
    depth: number,
    private readonly calm: boolean,
  ) {
    this.number = scene.add
      .text(0, 0, label, { fontFamily: HAND_FONT, fontSize: '76px', color: INK })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(depth);
    this.name = scene.add
      .text(0, 0, title, { fontFamily: HAND_FONT, fontSize: '38px', color: INK })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    this.line = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.number, this.name, this.line];
  }

  /** Progress 0..1 of the whole card (debug and tests); 1 once faded. */
  progress(): number {
    return Math.min(1, this.clock / (WRITE_NUMBER + WRITE_NAME + UNDERLINE + HOLD + FADE));
  }

  update(dt: number, width: number, height: number): void {
    if (this.done) return;
    this.clock += dt;
    const t = this.clock;
    const cx = width / 2,
      cy = height * 0.24;
    this.number.setPosition(cx, cy);
    this.name.setPosition(cx, cy + 4);
    const write = (text: Phaser.GameObjects.Text, start: number, span: number): void => {
      const u = this.calm ? 1 : Math.min(1, Math.max(0, (t - start) / span));
      // The pen moves left to right: reveal the glyphs by cropping, with a slight ease-out.
      const eased = 1 - (1 - u) ** 2;
      text.setCrop(0, 0, text.width * eased, text.height);
      text.setVisible(u > 0);
    };
    write(this.number, 0, WRITE_NUMBER);
    write(this.name, WRITE_NUMBER * 0.6, WRITE_NAME);
    const lineStart = WRITE_NUMBER * 0.6 + WRITE_NAME;
    const lu = this.calm ? 1 : Math.min(1, Math.max(0, (t - lineStart) / UNDERLINE));
    const end = lineStart + UNDERLINE + HOLD;
    const alpha = 1 - Math.min(1, Math.max(0, (t - (this.calm ? HOLD + 0.8 : end)) / FADE));
    this.number.setAlpha(alpha);
    this.name.setAlpha(alpha * 0.85);
    this.line.clear();
    if (lu > 0) {
      const half = Math.max(this.name.width * 0.62, 90);
      const y = cy + 4 + this.name.height + 2;
      const pts: Pt[] = [];
      const n = 14;
      for (let k = 0; k <= n * lu; k++) {
        const u = k / n;
        pts.push({ x: cx - half + 2 * half * u, y: y + Math.sin(u * Math.PI) * 3 - u * 4 });
      }
      if (pts.length > 1) strokeInk(this.line, wobble(pts, 77, 0.8, 10), 2.4, 0x16161a, alpha, 7);
      // A second, quicker flick under the first: a confident double underline.
      if (lu >= 1) {
        const flick: Pt[] = [
          { x: cx - half * 0.7, y: y + 8 },
          { x: cx + half * 0.55, y: y + 6 + hash(3) * 2 },
        ];
        strokeInk(this.line, wobble(flick, 79, 0.6, 10), 1.4, 0x16161a, alpha * 0.8, 9);
      }
    }
    if (alpha <= 0) {
      this.done = true;
      this.destroy();
    }
  }

  destroy(): void {
    this.number.destroy();
    this.name.destroy();
    this.line.destroy();
  }
}
