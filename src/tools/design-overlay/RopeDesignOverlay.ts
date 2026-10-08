import type * as Phaser from 'phaser';
import type { RuntimeTuning } from '../../content';
import type { LevelDef } from '../../sim';

/**
 * Dev-only rope design overlay (GMR-54). For each anchor in the level draws:
 *
 * - a thin dashed circle at the rope's minimum length and a solid faint circle at its
 *   maximum length (both read from tuning), and
 * - three faint swing arcs below the anchor (3 m, 6 m, 9 m), each spanning 60 degrees
 *   either side of straight down.
 *
 * The caller supplies a Phaser Graphics already placed in world space (under the HUD) and
 * the meters-to-pixels scale. Plain arithmetic only (Math.cos/Math.sin); nothing here
 * touches the simulation. Call once per scene creation, not per frame.
 */
export function drawRopeDesign(
  graphics: Phaser.GameObjects.Graphics,
  level: LevelDef,
  tuning: RuntimeTuning,
  pixelsPerMeter: number,
): void {
  const grey = 0x8a8a8a;
  const alpha = 0.35;
  const minLength = tuning.sim.rope.minLength;
  const maxLength = tuning.sim.rope.maxLength;
  if (!(minLength > 0) || !(maxLength >= minLength) || !(pixelsPerMeter > 0)) return;

  graphics.lineStyle(1.5, grey, alpha);
  for (const anchor of level.anchors) {
    const cx = anchor.position.x * pixelsPerMeter;
    const cy = anchor.position.y * pixelsPerMeter;
    dashedCircle(graphics, cx, cy, minLength * pixelsPerMeter);
    strokeArc(graphics, cx, cy, maxLength * pixelsPerMeter, 0, Math.PI * 2);
    // World +y is down, so straight down is angle PI/2; arcs span 60 degrees either side.
    const down = Math.PI / 2;
    const half = Math.PI / 3;
    for (const length of [3, 6, 9]) {
      strokeArc(graphics, cx, cy, length * pixelsPerMeter, down - half, down + half);
    }
  }
}

/** Stroke an arc as a polyline. Angles in radians, 0 = +x, increasing clockwise (+y down). */
function strokeArc(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): void {
  const span = endAngle - startAngle;
  if (!(span > 0) || !(radius > 0)) return;
  const segments = Math.max(8, Math.ceil((span / (Math.PI * 2)) * 96));
  let prevX = cx + radius * Math.cos(startAngle);
  let prevY = cy + radius * Math.sin(startAngle);
  for (let i = 1; i <= segments; i++) {
    const a = startAngle + (span * i) / segments;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    graphics.lineBetween(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}

/** Circle outline drawn as dashes with gaps (dash/gap lengths in pixels). */
function dashedCircle(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
): void {
  const dashAngle = 7 / radius;
  const gapAngle = 5 / radius;
  const step = dashAngle + gapAngle;
  const full = Math.PI * 2;
  for (let a = 0; a < full; a += step) {
    strokeArc(graphics, cx, cy, radius, a, Math.min(a + dashAngle, full));
  }
}
