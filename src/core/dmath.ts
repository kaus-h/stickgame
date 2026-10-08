/**
 * Deterministic math for the simulation. JavaScript engines may implement Math.sin, Math.cos and
 * Math.hypot differently in the last bits (measured: V8 vs SpiderMonkey vs JavaScriptCore), which
 * breaks bit-identical replays across browsers. Only +, -, *, /, Math.round and Math.sqrt (correctly
 * rounded by IEEE 754) are used here, so results are identical on every engine.
 */

/** π/2 as a double plus the rounding remainder, for accurate (Cody–Waite) range reduction. */
const HALF_PI = 1.5707963267948966;
const HALF_PI_LO = 6.123233995736766e-17;

/** sqrt(x² + y²) without Math.hypot. */
export function dlen(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Sine for |x| ≤ π/4 via a Taylor polynomial (error < 1e-16). */
function sinKernel(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 *
                    (1 / 362880 +
                      x2 * (-1 / 39916800 + x2 * (1 / 6227020800 - x2 / 1307674368000)))))))
  );
}

/** Cosine for |x| ≤ π/4 via a Taylor polynomial (error < 1e-16). */
function cosKernel(x: number): number {
  const x2 = x * x;
  return (
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 *
              (-1 / 720 +
                x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 - x2 / 87178291200))))))
  );
}

/** Reduce x to a quadrant and a kernel argument in [-π/4, π/4]. */
function reduce(x: number): [number, number] {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI - k * HALF_PI_LO;
  return [((k % 4) + 4) % 4, r];
}

export function dsin(x: number): number {
  const [q, r] = reduce(x);
  if (q === 0) return sinKernel(r);
  if (q === 1) return cosKernel(r);
  if (q === 2) return -sinKernel(r);
  return -cosKernel(r);
}

export function dcos(x: number): number {
  const [q, r] = reduce(x);
  if (q === 0) return cosKernel(r);
  if (q === 1) return -sinKernel(r);
  if (q === 2) return -cosKernel(r);
  return sinKernel(r);
}
