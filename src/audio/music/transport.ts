import { SECONDS_PER_BEAT } from './score';

/**
 * The music clock (GMR-42). One transport for the app's lifetime: it is started once and never
 * restarted by deaths, retries or respawns. `pump` is called from a ~25 ms timer and returns the
 * beats that start inside the lookahead horizon, each exactly once, with their audio-clock time.
 * After a stall (a hidden tab, a long frame) it skips to the next bar instead of replaying the
 * backlog, so it never machine-guns stale notes on resume.
 */
export interface ScheduledBeat {
  readonly beat: number;
  /** AudioContext time the beat starts, s. */
  readonly time: number;
}

export const LOOKAHEAD_S = 0.15;

export class Transport {
  private nextBeat = 0;
  private nextTime: number;

  constructor(startTime: number) {
    this.nextTime = startTime;
  }

  pump(now: number): ScheduledBeat[] {
    if (this.nextTime < now - SECONDS_PER_BEAT * 4) {
      // Stalled for more than a bar: jump to the first bar line on the original grid at or after
      // now. Bar phase is kept and nothing from the gap is replayed.
      const origin = this.nextTime - this.nextBeat * SECONDS_PER_BEAT;
      const bar = SECONDS_PER_BEAT * 4;
      const k = Math.ceil((now - origin) / bar);
      this.nextBeat = k * 4;
      this.nextTime = origin + k * bar;
    }
    const out: ScheduledBeat[] = [];
    while (this.nextTime < now + LOOKAHEAD_S) {
      out.push({ beat: this.nextBeat, time: this.nextTime });
      this.nextBeat++;
      this.nextTime += SECONDS_PER_BEAT;
    }
    return out;
  }

  /** The next bar line at or after `time` (section bank swaps and stings land on the grid). */
  nextBarTime(): { beat: number; time: number } {
    const beatsToBar = (4 - (this.nextBeat % 4)) % 4;
    return {
      beat: this.nextBeat + beatsToBar,
      time: this.nextTime + beatsToBar * SECONDS_PER_BEAT,
    };
  }

  get beat(): number {
    return this.nextBeat;
  }
}
