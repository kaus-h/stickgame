import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { SimEvent, SimSnapshot } from '../../sim';
import type { RenderFrame } from '../frame';
import { EventLog, formatOverlay } from './format';

const INK = 0x16161a;
const BLUE = 0x2f5fb3;
const RED = 0xc5302a;
const GREEN = 0x2e8b57;
const TRAIL_TICKS = 120;

/**
 * Development overlay (GMR-28): numbers, a structured event log and world-space vectors, so a bad
 * swing can be diagnosed without ad-hoc logging. Toggle with the backtick key. Only constructed
 * when the app enables debug, so production presentation never carries it.
 */
export class DebugOverlay {
  readonly log = new EventLog(200);
  private visible = false;
  private readonly text: Phaser.GameObjects.Text;
  private readonly world: Phaser.GameObjects.Graphics;
  private readonly trail: { x: number; y: number }[] = [];
  private lastTick = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.world = scene.add.graphics().setDepth(50).setVisible(false);
    this.text = scene.add
      .text(12, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#16161a',
        backgroundColor: '#f3efe6dd',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    scene.input.keyboard?.on('keydown-BACKTICK', () => {
      this.setVisible(!this.visible);
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.text.setVisible(visible);
    this.world.setVisible(visible);
  }

  onEvents(events: readonly SimEvent[]): void {
    this.log.push(events);
  }

  draw(frame: RenderFrame): void {
    const s = frame.current;
    this.recordTrail(s);
    if (!this.visible) return;
    const lines = [...formatOverlay(s, frame.stats), '— events —', ...this.log.tail(8), '[`] hide'];
    this.text.setText(lines.join('\n'));
    this.text.setPosition(12, this.scene.scale.height - this.text.height - 12);
    this.drawWorld(s);
  }

  private recordTrail(s: SimSnapshot): void {
    if (s.tick === this.lastTick) return;
    if (s.attemptTick === 0) this.trail.length = 0;
    this.lastTick = s.tick;
    this.trail.push({ x: m(s.player.position.x), y: m(s.player.position.y) });
    if (this.trail.length > TRAIL_TICKS) this.trail.shift();
  }

  private drawWorld(s: SimSnapshot): void {
    const g = this.world;
    g.clear();
    const p = { x: m(s.player.position.x), y: m(s.player.position.y) };

    // Recent path, one dot per tick: spacing shows speed.
    g.fillStyle(BLUE, 0.5);
    for (const t of this.trail) g.fillCircle(t.x, t.y, 1.6);

    // Velocity: 0.1 s of travel.
    const v = s.player.velocity;
    this.arrow(g, p, { x: p.x + m(v.x * 0.1), y: p.y + m(v.y * 0.1) }, BLUE);

    // Rope: the swing circle, the pivot and the radius line.
    if (s.rope) {
      const pivot = { x: m(s.rope.point.x), y: m(s.rope.point.y) };
      g.lineStyle(1, s.rope.locked ? GREEN : INK, 0.5);
      g.strokeCircle(pivot.x, pivot.y, m(s.rope.length));
      g.fillStyle(GREEN, 0.9).fillCircle(pivot.x, pivot.y, 3);
    }

    // Target: aim to impact, with the selection result.
    if (s.target?.impact && s.aim) {
      g.lineStyle(1, s.target.valid ? GREEN : RED, 0.8);
      g.lineBetween(p.x, p.y, m(s.target.impact.x), m(s.target.impact.y));
    }

    // Contacts begun this tick: normals at the player.
    for (const c of s.contacts) {
      this.arrow(
        g,
        p,
        { x: p.x + m(c.normal.x * 0.6), y: p.y + m(c.normal.y * 0.6) },
        c.kind === 'hazard' ? RED : INK,
      );
    }
  }

  private arrow(
    g: Phaser.GameObjects.Graphics,
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: number,
  ): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;
    g.lineStyle(2, color, 0.85).lineBetween(a.x, a.y, b.x, b.y);
    const ux = dx / len;
    const uy = dy / len;
    const h = Math.min(8, len * 0.4);
    g.lineBetween(b.x, b.y, b.x - ux * h - uy * h * 0.5, b.y - uy * h + ux * h * 0.5);
    g.lineBetween(b.x, b.y, b.x - ux * h + uy * h * 0.5, b.y - uy * h - ux * h * 0.5);
  }
}
