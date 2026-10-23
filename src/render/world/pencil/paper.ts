import { worldColorCss, type WorldStyle } from '../WorldStyle';
import { rng } from './rng';

/**
 * Toothy cool sketchbook paper (chapter 1) with notebook ruling (owner 2026-10-23), no margin. Per-pixel tooth (seamless by
 * construction), faint wrapped tonal blotches and short fibres. The large-scale tone and the
 * graphite smudges live in the parallax vista, so a 256 px repeat never reads as a pattern.
 */
export function paintSketchbookPaper(
  c: CanvasRenderingContext2D,
  size: number,
  style: WorldStyle,
): void {
  const r = rng(0x5eed);
  c.fillStyle = worldColorCss(style.paper.base);
  c.fillRect(0, 0, size, size);
  // Wrapped blotches: each is drawn at every tile offset it overlaps, so the tile stays seamless.
  for (let i = 0; i < 14; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 30 + r() * 70;
    const light = r() < 0.45;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(
          0,
          light ? 'rgba(236,239,242,0.10)' : worldColorCss(style.paper.fibre, 0.07),
        );
        g.addColorStop(1, light ? 'rgba(236,239,242,0)' : worldColorCss(style.paper.fibre, 0));
        c.fillStyle = g;
        c.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }
  // Notebook ruling every 0.5 m (32 px, so the 256 px tile repeats seamlessly), drawn before the
  // tooth so the grain breaks the lines up like ink on real paper.
  for (let y = 16; y < size; y += 32) {
    c.fillStyle = worldColorCss(style.paper.rule, 0.5);
    c.fillRect(0, y, size, 1);
    c.fillStyle = worldColorCss(style.paper.rule, 0.18);
    c.fillRect(0, y + 1, size, 1);
  }
  // Tooth: cold-press grain, slightly clumped so it reads as paper rather than noise.
  const img = c.getImageData(0, 0, size, size);
  const d = img.data;
  const clump = new Float32Array(size * size);
  for (let i = 0; i < clump.length; i++) clump[i] = r();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const right = clump[y * size + ((x + 1) % size)] ?? 0;
      const down = clump[((y + 1) % size) * size + x] ?? 0;
      const v = ((clump[i] ?? 0) * 0.5 + right * 0.25 + down * 0.25 - 0.5) * 22;
      const pit = (clump[i] ?? 0) > 0.93 ? -10 : 0;
      d[i * 4] = Math.max(0, Math.min(255, (d[i * 4] ?? 0) + v + pit));
      d[i * 4 + 1] = Math.max(0, Math.min(255, (d[i * 4 + 1] ?? 0) + v + pit));
      d[i * 4 + 2] = Math.max(0, Math.min(255, (d[i * 4 + 2] ?? 0) + v + pit + 1));
    }
  }
  c.putImageData(img, 0, 0);
  // Fibres and faint stray graphite grains.
  c.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 2 + r() * 6;
    const ang = (r() - 0.5) * 1.2;
    c.strokeStyle = r() < 0.5 ? 'rgba(240,242,245,0.35)' : worldColorCss(style.paper.fibre, 0.22);
    c.lineWidth = 0.5 + r() * 0.5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
}
