import type * as Phaser from 'phaser';
import { metersToPixels as m, vec2, type Vec2 } from '../core';

/** Render marks share the authored rectangle/inset; they never invent collision or targets. */
export function enemyOutline(
  position: Vec2,
  size: Vec2,
  topInset: number,
): {
  min: Vec2;
  max: Vec2;
  safeLeft: number;
  safeRight: number;
} {
  const min = vec2(position.x - size.x / 2, position.y - size.y / 2);
  const max = vec2(position.x + size.x / 2, position.y + size.y / 2);
  return { min, max, safeLeft: min.x + topInset, safeRight: max.x - topInset };
}

/** Original rectangular ink critter: flat paper top, wary eyes, dangerous red perimeter. */
export function drawPatroller(
  g: Phaser.GameObjects.Graphics,
  position: Vec2,
  size: Vec2,
  topInset: number,
  facing: number,
): void {
  const { min, max, safeLeft, safeRight } = enemyOutline(position, size, topInset);
  const x = m(min.x),
    y = m(min.y),
    w = m(size.x),
    h = m(size.y);
  g.fillStyle(0x16161a, 1).fillRect(x, y, w, h);
  // The vulnerable horizontal top is paper white with an ink baseline, distinct from the sides.
  g.fillStyle(0xf3efe6, 1).fillRect(
    m(safeLeft),
    y,
    m(safeRight - safeLeft),
    Math.min(m(0.12), h * 0.15),
  );
  g.lineStyle(2, 0x16161a, 1).lineBetween(m(safeLeft), y, m(safeRight), y);
  g.lineStyle(2.5, 0xc5302a, 1);
  const inset = Math.min(1.25, w / 8, h / 8);
  if (m(topInset) > inset * 2) {
    g.lineBetween(x + inset, y + inset, m(safeLeft) - inset, y + inset);
    g.lineBetween(m(safeRight) + inset, y + inset, m(max.x) - inset, y + inset);
  }
  g.lineBetween(x + inset, y + inset, x + inset, m(max.y) - inset);
  g.lineBetween(m(max.x) - inset, y + inset, m(max.x) - inset, m(max.y) - inset);
  g.lineBetween(x + inset, m(max.y) - inset, m(max.x) - inset, m(max.y) - inset);
  // Hand-cut paper eyes and stitched mouth stay inside the actual body, with no false horns/feet.
  for (const offset of [-0.2, 0.2]) {
    const eyeX = x + w * (0.5 + offset + facing * 0.04);
    const eyeY = y + h * 0.4;
    g.fillStyle(0xf3efe6, 1).fillRect(eyeX - w * 0.09, eyeY - h * 0.06, w * 0.18, h * 0.15);
    g.fillStyle(0x16161a, 1).fillRect(eyeX + facing * w * 0.035, eyeY, w * 0.04, h * 0.08);
  }
  g.lineStyle(1.5, 0xf3efe6, 0.8).lineBetween(x + w * 0.3, y + h * 0.72, x + w * 0.7, y + h * 0.72);
  for (const fraction of [0.36, 0.5, 0.64])
    g.lineBetween(x + w * fraction, y + h * 0.67, x + w * fraction, y + h * 0.77);
}
