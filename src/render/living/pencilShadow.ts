import { metersToPixels as m } from '../../core';
import type { SolidDef } from '../../sim';
import { hash } from '../ink';

/** Shadow offset on the page (meters): light from the upper left, like a desk lamp. */
export const SHADOW_OFFSET = { x: 0.14, y: 0.2 };

/**
 * A soft graphite shadow under a block (Living Notebook pillar 4): the block's shape, offset down
 * and right, filled with a faint wash and quick pencil hatching. Painted before the block so
 * only the rim shows. Presentation only; collision is untouched.
 */
export function paintPencilShadow(c: CanvasRenderingContext2D, solid: SolidDef): void {
  const dx = m(SHADOW_OFFSET.x);
  const dy = m(SHADOW_OFFSET.y);
  const xs = solid.points.map((p) => m(p.x) + dx);
  const ys = solid.points.map((p) => m(p.y) + dy);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  c.save();
  c.beginPath();
  solid.points.forEach((p, i) => {
    if (i === 0) c.moveTo(m(p.x) + dx, m(p.y) + dy);
    else c.lineTo(m(p.x) + dx, m(p.y) + dy);
  });
  c.closePath();
  c.fillStyle = 'rgba(70, 62, 52, 0.08)';
  c.fill();
  c.clip();
  c.strokeStyle = 'rgba(70, 62, 52, 0.28)';
  c.lineWidth = 1;
  c.lineCap = 'round';
  const span = x1 - x0 + (y1 - y0);
  let k = 0;
  for (let u = 0; u < span; u += 4.5, k++) {
    if (hash(k * 0.37 + x0 * 0.001) < 0.15) continue;
    const sx = x0 + u;
    c.beginPath();
    c.moveTo(sx, y0);
    c.lineTo(sx - (y1 - y0), y1);
    c.stroke();
  }
  c.restore();
}
