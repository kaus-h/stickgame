/**
 * The title page's living doodle (Living Notebook pillar 6): the hero swings on a dashed rope from
 * a highlighted anchor, drawn in boiling pen line on the page. Canvas 2D, menu-only, no sim.
 */
const INK = '#16161a';
const HIGHLIGHT = 'rgba(255, 225, 74, 0.6)';
const BOIL_FPS = 8;

/** Deterministic 0..1 noise. */
function noise(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Swing angle (radians from straight down) and angular speed at time t (s). */
export function swingAt(t: number): { angle: number; speed: number } {
  const w = 2.1;
  return { angle: 0.82 * Math.sin(w * t), speed: 0.82 * w * Math.cos(w * t) };
}

export function startTitleDoodle(canvas: HTMLCanvasElement, calm: boolean): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 420;
  const H = canvas.clientHeight || 220;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.scale(dpr, dpr);
  let raf = 0;
  const t0 = performance.now();

  const frame = (now: number): void => {
    const t = calm ? 0.35 : (now - t0) / 1000;
    const drawing = calm ? 0 : Math.floor(t * BOIL_FPS) % 3;
    // Boil: every point shifts a little, differently in each of three drawings.
    const j = (x: number, y: number, k: number): [number, number] => [
      x + (noise(k * 3.1 + drawing * 17.3) - 0.5) * 1.6,
      y + (noise(k * 5.7 + drawing * 29.1) - 0.5) * 1.6,
    ];
    const line = (pts: [number, number][], width: number, seed: number, color = INK): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [px, py] = j(x, y, seed + i);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    ctx.clearRect(0, 0, W, H);

    const ax = W / 2;
    const ay = 26;
    const len = H - 118;
    const { angle, speed } = swingAt(t);
    const hx = ax + Math.sin(angle) * len;
    const hy = ay + Math.cos(angle) * len;

    // Anchor: a highlighter swipe behind an inked ring (the targeted-anchor language).
    ctx.fillStyle = HIGHLIGHT;
    ctx.beginPath();
    ctx.ellipse(ax + 2, ay + 1, 21, 12, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    const [rx, ry] = j(ax, ay, 1);
    ctx.beginPath();
    ctx.arc(rx, ry, 9, 0, Math.PI * 2);
    ctx.stroke();
    line(
      [
        [ax, ay - 9],
        [ax, ay - 20],
      ],
      2.6,
      3,
    );

    // Rope: dashed pen line from the ring to the hand.
    ctx.save();
    ctx.setLineDash([9, 6]);
    line(
      [
        [ax, ay + 9],
        [hx, hy],
      ],
      2.4,
      5,
    );
    ctx.restore();

    // Speed hatching behind the hero, strongest at the bottom of the arc.
    const fast = Math.abs(speed) / 1.75;
    if (fast > 0.45) {
      const dir = Math.sign(speed);
      const tx = Math.cos(angle) * dir;
      const ty = -Math.sin(angle) * dir;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 9;
        const sx = hx - tx * 26 - ty * off;
        const sy = hy + 26 - ty * 26 + tx * off;
        const l = 18 + fast * 26;
        line(
          [
            [sx, sy],
            [sx - tx * l, sy - ty * l],
          ],
          1.6,
          40 + i,
          `rgba(22,22,26,${String(0.25 + 0.4 * (fast - 0.45))})`,
        );
      }
    }

    // The hero: hand on the rope, body hanging below, legs trailing the swing.
    const bodyA = angle * 0.85;
    const down = (a: number, d: number, x: number, y: number): [number, number] => [
      x + Math.sin(a) * d,
      y + Math.cos(a) * d,
    ];
    // Arm straight up to the rope; the head hangs beside the arm, below the hand.
    const shoulder = down(bodyA, 26, hx, hy);
    const side = Math.sign(speed || 1);
    const neck = down(bodyA, -13, shoulder[0], shoulder[1]);
    const head: [number, number] = [
      neck[0] + Math.cos(bodyA) * 9 * side,
      neck[1] - Math.sin(bodyA) * 9 * side,
    ];
    const hip = down(bodyA, 26, shoulder[0], shoulder[1]);
    const trail = -speed * 0.28;
    line([[hx, hy], shoulder], 2.6, 60);
    line([shoulder, down(bodyA - 0.9 + trail, 15, shoulder[0], shoulder[1])], 2.4, 62);
    line([shoulder, hip], 2.8, 64);
    for (const [k, spread] of [
      [0, 0.32],
      [1, -0.22],
    ] as const) {
      const knee = down(bodyA + spread + trail, 13, hip[0], hip[1]);
      const foot = down(bodyA + spread * 0.4 + trail * 1.6, 13, knee[0], knee[1]);
      line([hip, knee, foot], 2.6, 66 + k * 3);
    }
    // Head: a ring with two dot eyes looking along the swing.
    const [cx, cy] = j(head[0], head[1], 80);
    ctx.fillStyle = '#f3efe6';
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    const look = Math.sign(speed || 1) * 3.5;
    for (const ex of [-4.5, 4.5]) {
      ctx.beginPath();
      ctx.arc(cx + ex + look, cy - 1, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!calm) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
  };
}
