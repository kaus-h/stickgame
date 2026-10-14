import type { LevelDef, SimEvent, SimSnapshot } from '../../sim';
import type { StingCue } from './score';

/**
 * What the music should be doing (GMR-42). Reads simulation events and snapshots, never writes
 * anything back: it only outputs layer targets and stings for the music engine.
 *
 * - **Pulse** follows the player's movement energy. It swells while running and swinging and fades
 *   to "pencil ghosts" while the player stands still and plans, so it never competes with the
 *   attach and release cues when precision matters.
 * - **Tension** rises through the level's chambers. A death dips it for a moment; nothing restarts.
 * - **Sting**: a soft chime figure when the player moves into a new chamber for the first time this
 *   run (a different one each clear, climbing through the level), and a resolving one on the exit.
 */
export interface MusicTargets {
  readonly base: number;
  readonly pulse: number;
  readonly tension: number;
  /** A death dip is in progress: the tension drop is applied at once (not on the next bar). */
  readonly dipping: boolean;
  /** Section bank id (switched at the next bar line by the engine). */
  readonly bank: string;
}

export interface MusicSink {
  setTargets(t: MusicTargets): void;
  sting(cue: StingCue): void;
}

const PULSE_FULL_SPEED = 9;
const DEATH_DIP_S = 1.6;

export class MusicDirector {
  private chamber = -1;
  private reached = -1;
  private dip = 0;
  private energy = 0;

  constructor(
    private readonly sink: MusicSink,
    private level: LevelDef,
  ) {}

  /** A new level: its chambers and section bank; reached chambers start over. */
  setLevel(level: LevelDef): void {
    this.level = level;
    this.restartRun();
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'death') this.dip = DEATH_DIP_S;
      if (e.type === 'exit') {
        const n = Math.max(1, this.level.chambers?.length ?? 1);
        this.sink.sting({ index: n, progress: 1, final: true });
      }
      if (e.type === 'lifeEnd' && e.reason === 'restart') this.restartRun();
    }
  }

  /** Once per rendered frame. `dt` in seconds. */
  onFrame(s: SimSnapshot, dt: number): void {
    const p = s.player.position;
    const chambers = this.level.chambers ?? [];
    const idx = chambers.findIndex(
      (c) =>
        p.x >= c.region.min.x &&
        p.x <= c.region.max.x &&
        p.y >= c.region.min.y &&
        p.y <= c.region.max.y,
    );
    if (idx >= 0 && idx !== this.chamber) {
      this.chamber = idx;
      if (idx > this.reached) {
        // A chamber reached for the first time this run gets the clear sting (not the first one).
        if (this.reached >= 0)
          this.sink.sting({
            index: idx,
            progress: chambers.length > 1 ? idx / (chambers.length - 1) : 1,
            final: false,
          });
        this.reached = idx;
      }
    }
    const speed = Math.hypot(s.player.velocity.x, s.player.velocity.y);
    const target = Math.min(1, speed / PULSE_FULL_SPEED);
    // Fast attack, slow release: a swing lights the pulse at once, stopping lets it fade over ~2 s.
    this.energy += (target - this.energy) * Math.min(1, dt * (target > this.energy ? 6 : 0.6));
    this.dip = Math.max(0, this.dip - dt);
    const progress = chambers.length > 1 ? Math.max(0, this.chamber) / (chambers.length - 1) : 0;
    const tension = (0.15 + 0.55 * progress) * (this.dip > 0 ? 0.25 : 1);
    this.sink.setTargets({
      base: 1,
      pulse: 0.15 + 0.85 * this.energy,
      tension,
      dipping: this.dip > 0,
      bank: this.level.section === 'section-2' ? 'section-2' : 'section-1',
    });
  }

  /** A restart (new run) forgets which chambers were reached. A death or respawn does not. */
  restartRun(): void {
    this.reached = -1;
    this.chamber = -1;
  }
}
