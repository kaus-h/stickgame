/**
 * Room tone (owner playtest 2026-10-12: atmosphere). A quiet, warm hush under everything, like
 * the air of a room at night with a lamp on: brown noise, low-passed, with a slow breath in its
 * level. Rendered once, deterministically, and looped seamlessly on the music bus.
 */
export const ROOM_TONE_SECONDS = 8;
/** Loop gain on the music bus: felt more than heard. */
export const ROOM_TONE_GAIN = 0.07;

export function renderRoomTone(
  sampleRate: number,
  seconds = ROOM_TONE_SECONDS,
): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * seconds);
  const out = new Float32Array(new ArrayBuffer(n * 4));
  let seed = 0x5eed1234;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  // Brown noise (integrated white noise with a leak), then a one-pole low-pass for warmth.
  let brown = 0,
    low = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 380) / sampleRate);
  for (let i = 0; i < n; i++) {
    brown = (brown + rand() * 0.04) * 0.996;
    low += (brown - low) * k;
    // Two slow breaths per loop, so the seam lands in the same phase it started in.
    const breath = 0.8 + 0.2 * Math.sin((2 * Math.PI * 2 * i) / n);
    out[i] = low * breath;
  }
  // Normalize to a fixed peak so the loop gain alone sets loudness.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i] ?? 0));
  const scale = peak > 0 ? 0.9 / peak : 0;
  // Crossfade the last half second into the start: no click at the loop point.
  const fade = Math.min(Math.round(sampleRate * 0.5), Math.floor(n / 4));
  const head = out.slice(0, fade);
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    const j = n - fade + i;
    out[j] = (out[j] ?? 0) * (1 - u) + (head[i] ?? 0) * u;
  }
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * scale;
  return out.subarray(0, n - fade).slice();
}
