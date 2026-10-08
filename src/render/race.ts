/**
 * Racing time formats (GMR-103), shared by the HUD and the results screen. Pure functions, no
 * Phaser, so the app UI can use them too.
 */

/** mm:ss.cc from simulation ticks (60 Hz). */
export function formatRaceTime(ticks: number): string {
  const total = Math.max(0, ticks) / 60;
  const mm = Math.floor(total / 60);
  const ss = total - mm * 60;
  return `${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`;
}

export type DeltaTone = 'faster' | 'slower' | 'even';

/**
 * A split delta against the PB in seconds, always signed so colour is never the only channel:
 * "−0.42" (faster, U+2212 minus), "+0.42" (slower), "±0.00" (the same tick).
 */
export function formatDelta(deltaTicks: number): {
  readonly text: string;
  readonly tone: DeltaTone;
} {
  const secs = (Math.abs(deltaTicks) / 60).toFixed(2);
  if (deltaTicks < 0) return { text: `−${secs}`, tone: 'faster' };
  if (deltaTicks > 0) return { text: `+${secs}`, tone: 'slower' };
  return { text: `±${secs}`, tone: 'even' };
}

/** Blue pen for faster, red pen for slower, ink for even (doc 07: colour is rare and meaningful). */
export const DELTA_COLOURS: Readonly<Record<DeltaTone, string>> = {
  faster: '#2f5fb3',
  slower: '#c5302a',
  even: '#16161a',
};

/** How long a split stays on screen, in simulation ticks (about 2 s). */
export const SPLIT_VISIBLE_TICKS = 120;
