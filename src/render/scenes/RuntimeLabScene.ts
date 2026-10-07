import * as Phaser from 'phaser';
import { metersToPixels } from '../../core';
import type { FrameSource, RenderFrame } from '../frame';

const PAPER = 0xf2ede4;
const INK = 0x111111;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Runtime lab (GMR-18): draws the timing probe with interpolation and shows simulation timing.
 * Rendering only reads snapshots; it never changes simulation state.
 */
export class RuntimeLabScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Text;

  constructor(private readonly source: FrameSource) {
    super('runtime-lab');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAPER);
    this.graphics = this.add.graphics();
    this.overlay = this.add.text(12, 10, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#111111',
      lineSpacing: 2,
    });
  }

  override update(_time: number, deltaMs: number): void {
    const frame = this.source.frame(deltaMs / 1000);
    this.drawWorld(frame);
    this.overlay.setText(this.describe(frame));
  }

  private drawWorld({ previous, current, alpha }: RenderFrame): void {
    const g = this.graphics;
    g.clear();

    g.lineStyle(3, INK, 1);
    g.lineBetween(
      metersToPixels(1),
      metersToPixels(8.25),
      metersToPixels(14.25),
      metersToPixels(8.25),
    );

    // A reset between the two snapshots means there is nothing to blend; draw the new state.
    const blend = current.attemptTick > previous.attemptTick ? alpha : 1;
    const x = lerp(previous.probe.position.x, current.probe.position.x, blend);
    const y = lerp(previous.probe.position.y, current.probe.position.y, blend);
    g.fillStyle(INK, 1);
    g.fillCircle(metersToPixels(x), metersToPixels(y), metersToPixels(0.25));
  }

  private describe({ stats: s }: RenderFrame): string {
    return [
      `sim ${String(s.simHz)} Hz fixed | steps/frame ${String(s.stepsLastFrame)} | alpha ${s.alpha.toFixed(2)}${s.paused ? ' | PAUSED' : ''}`,
      `frame ${s.frameMsAvg.toFixed(1)} ms avg / ${s.frameMsMax.toFixed(1)} max | sim step ${s.simStepMsAvg.toFixed(3)} ms avg`,
      `capped frames ${String(s.cappedFrames)} | dropped ${s.droppedSeconds.toFixed(3)} s`,
      `tick ${String(s.tick)} | attempt tick ${String(s.attemptTick)} | resets ${String(s.resets)}`,
      `entities ${String(s.entities)} | bodies ${String(s.bodies)} | joints ${String(s.joints)}`,
      `[R] restart   ?fps=30 or ?fps=144 to test frame rates`,
    ].join('\n');
  }
}
