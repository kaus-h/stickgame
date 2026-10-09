import type * as Phaser from 'phaser';

const INK = 0x16161a;
const PINK = 0xef8fa3;
const PINK_TOP = 0xf8c3cd;
const PINK_SIDE = 0xc7647b;

/**
 * A pink rubber eraser block in pseudo-3D (GMR-104): lighter top face, darker end face and a
 * slight perspective tilt, inked like the rest of the page. No image asset. Screen pixels; (x, y)
 * is the centre of the front face, `size` its length, `tilt` the rocking angle in radians.
 */
export function drawEraser(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  tilt: number,
): void {
  const L = size;
  const T = size * 0.36;
  // The top face recedes up and to the right: the block is seen from slightly above.
  const dx = size * 0.2;
  const dy = -size * 0.22;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const P = (px: number, py: number): { x: number; y: number } => ({
    x: x + (px - L / 2) * c - (py - T / 2) * s,
    y: y + (px - L / 2) * s + (py - T / 2) * c,
  });
  const front = [P(0, 0), P(L, 0), P(L, T), P(0, T)];
  const top = [P(0, 0), P(dx, dy), P(L + dx, dy), P(L, 0)];
  const side = [P(L, 0), P(L + dx, dy), P(L + dx, T + dy), P(L, T)];
  // Soft contact shadow on the page.
  g.fillStyle(INK, 0.12).fillEllipse(x + size * 0.08, y + T * 0.75, L * 1.1, T * 0.5);
  for (const [face, colour] of [
    [front, PINK],
    [top, PINK_TOP],
    [side, PINK_SIDE],
  ] as const) {
    g.fillStyle(colour, 1).lineStyle(2.4, INK, 1).beginPath();
    face.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.closePath().fillPath().strokePath();
  }
  // A pencil highlight along the top edge and a little wear on the rubbing face.
  g.lineStyle(1.4, 0xffffff, 0.7);
  const a = P(L * 0.12 + dx * 0.5, dy * 0.5);
  const b = P(L * 0.7 + dx * 0.5, dy * 0.5);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(1.2, INK, 0.35);
  for (let k = 1; k < 4; k++) {
    const p0 = P((L * k) / 4, T * 0.7);
    const p1 = P((L * k) / 4 + L * 0.06, T * 0.95);
    g.lineBetween(p0.x, p0.y, p1.x, p1.y);
  }
}
