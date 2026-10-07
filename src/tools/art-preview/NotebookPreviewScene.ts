import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';

/** Paper-and-ink palette from doc 07 §1. */
const PAPER = 0xf3efe6;
const RULE = 0x9fc3e0;
const MARGIN = 0xe58a8a;
const HOLE = 0x2b2b2b;

/** College-ruled spacing in world meters (world-anchored so it doubles as a height ruler, doc 07 §2). */
const RULE_SPACING = 0.5;

const ASSETS = [
  'platform-left',
  'platform-mid',
  'platform-right',
  'platform-small',
  'anchor-inactive',
  'anchor-active',
  'anchor-timed',
  'anchor-one-use',
  'hazard-thorns',
  'exit-door',
] as const;

/**
 * Dev-only pipeline check (GMR-40): sliced test assets on a procedural notebook page at gameplay
 * scale (64 px per meter). Not a level; positions are arbitrary.
 */
export class NotebookPreviewScene extends Phaser.Scene {
  constructor(private readonly assetSet: string) {
    super('notebook-preview');
  }

  preload(): void {
    for (const key of ASSETS) this.load.image(key, `/assets/art/${this.assetSet}/1x/${key}.png`);
  }

  create(): void {
    const worldW = 22;
    const worldH = 11;
    this.drawPaper(worldW, worldH);

    // Ground run on the left: end cap + two tiled middles.
    const groundTop = 6;
    this.placeTop('platform-left', 1.6, groundTop);
    this.placeTop('platform-mid', 1.6 + 1.85, groundTop);
    this.placeTop('platform-mid', 1.6 + 1.85 + 2.4, groundTop);

    // Floating pieces and the four anchor states standing on them.
    this.placeTop('platform-small', 9.2, 4.2);
    this.placeTop('platform-mid', 11.5, 5.0);
    this.placeBottom('anchor-inactive', 7.2, groundTop);
    this.placeBottom('anchor-active', 9.6, 4.2);
    this.placeBottom('anchor-timed', 12.0, 5.0);
    this.placeBottom('anchor-one-use', 13.2, 5.0);

    // Exit ledge on the right.
    this.placeTop('platform-right', 18.0, groundTop - 1);
    this.placeBottom('exit-door', 18.6, groundTop - 1);

    // Lethal strip along the bottom of the page.
    for (let x = 1.6; x < worldW; x += 6.2) this.placeBottom('hazard-thorns', x, worldH - 0.6, 0);

    this.cameras.main.setBackgroundColor(PAPER);
    this.cameras.main.setBounds(0, 0, m(worldW), m(worldH));
    this.cameras.main.centerOn(m(worldW / 2), m(worldH / 2));
  }

  /** Place an object so its top edge sits at y (meters). */
  private placeTop(key: string, x: number, y: number): void {
    this.add.image(m(x), m(y), key).setOrigin(0, 0.02);
  }

  /** Place an object so its bottom edge sits at y (meters). */
  private placeBottom(key: string, x: number, y: number, originX = 0.5): void {
    this.add.image(m(x), m(y), key).setOrigin(originX, 1);
  }

  private drawPaper(worldW: number, worldH: number): void {
    const g = this.add.graphics();
    g.fillStyle(PAPER, 1).fillRect(0, 0, m(worldW), m(worldH));
    g.lineStyle(1, RULE, 0.55);
    for (let y = RULE_SPACING * 3; y < worldH; y += RULE_SPACING)
      g.lineBetween(0, m(y), m(worldW), m(y));
    g.lineStyle(1.5, MARGIN, 0.7).lineBetween(m(1.2), 0, m(1.2), m(worldH));
    g.fillStyle(HOLE, 0.85);
    for (const y of [0.22, 0.5, 0.78]) g.fillCircle(m(0.5), m(worldH * y), m(0.18));
  }
}
