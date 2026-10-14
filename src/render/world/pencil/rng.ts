/** Seeded presentation RNG (mulberry32): the same level always bakes the same drawing. */
export function rng(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable integer seed from a string (level ids). */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic 0..1 noise at an integer lattice point. */
export function lattice(x: number, seed: number): number {
  let h = Math.imul((Math.floor(x) ^ Math.imul(seed, 0x27d4eb2d)) | 0, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1 along one axis, world-locked (x in any unit, period ~1). */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return lattice(i, seed) * (1 - s) + lattice(i + 1, seed) * s;
}

/** Two octaves of value noise in -1..1. */
export function fbm1(x: number, seed: number): number {
  return (noise1(x, seed) - 0.5) * 1.4 + (noise1(x * 2.7, seed + 17) - 0.5) * 0.6;
}
