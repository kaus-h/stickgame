import type { LevelDef, SimEvent, SimSnapshot } from '../sim';
import type { TelemetryEvent } from './schema';

/** Design telemetry is a passive projection of simulation events and immutable snapshots. */
export class TelemetryDirector {
  private started = false;
  private runDeaths = 0;
  private life = 1;
  private lastRunTicks = 0;
  private lastChamber: string | null = null;
  private readonly visitedChambers = new Set<string>();
  private attached: { readonly anchor: number; readonly tick: number } | null = null;
  private previous: SimSnapshot | null = null;
  private completed = false;
  private quitRecorded = false;

  constructor(private readonly level: LevelDef) {}

  /**
   * Called after the runtime delivers events, and with [] on render frames without events.
   * The runtime may batch multiple simulation ticks into one delivery; events retain their ticks.
   */
  onEvents(events: readonly SimEvent[], snapshot: SimSnapshot): TelemetryEvent[] {
    const result: TelemetryEvent[] = [];
    if (!this.started) {
      this.started = true;
      this.life = snapshot.lives;
      result.push(this.attemptStart(snapshot.tick, snapshot.checkpoint >= 0));
    } else if (events.length === 0 && snapshot.runTick < this.lastRunTicks) {
      // A direct simulation reset that did not arrive through an event listener.
      this.clearRun();
      this.life = snapshot.lives;
      result.push(this.attemptStart(snapshot.tick, snapshot.checkpoint >= 0));
    }

    const levelId = this.level.telemetry?.levelId ?? this.level.id;
    for (const event of events) {
      switch (event.type) {
        case 'lifeEnd':
          if (event.reason === 'restart') {
            this.clearRun();
            this.life = 1;
          } else if (event.reason === 'death' || event.reason === 'respawn') {
            this.life = event.life + 1;
          } else {
            this.life = event.life;
          }
          break;
        case 'reset':
          // A legacy exit can immediately reset the level without a restart lifeEnd event.
          if (this.completed || snapshot.runTick < this.lastRunTicks) {
            this.clearRun();
            this.life = snapshot.lives;
          }
          this.attached = null;
          // reset occurs after death/respawn or an explicit restart, not on each render frame.
          result.push(this.attemptStart(event.tick, snapshot.checkpoint >= 0));
          break;
        case 'death':
          this.runDeaths++;
          this.attached = null;
          result.push({
            name: 'death',
            tick: event.tick,
            props: {
              levelId,
              chamberId: this.chamberAt(event.at.x, event.at.y),
              cause: event.cause,
              x: round1(event.at.x),
              y: round1(event.at.y),
              lifeTicks: event.attemptTicks,
              ropeAttached: event.rope !== null,
            },
          });
          break;
        case 'ropeAttach': {
          const rope = snapshot.rope;
          const anchor = this.level.anchors[event.anchor];
          const center = snapshot.anchors[event.anchor];
          // For a batched attach+release there is no longer an impact point in the last snapshot.
          // Do not invent an impact offset; preserve that missingness in the exported data.
          const offset = rope?.anchor === event.anchor ? rope.point : null;
          const candidate =
            !offset && snapshot.target?.valid && snapshot.target.anchor === event.anchor
              ? snapshot.target.impact
              : null;
          const point = offset ?? candidate;
          const sample = this.previous?.tick === event.tick ? this.previous : snapshot;
          this.attached = { anchor: event.anchor, tick: event.tick };
          result.push({
            name: 'rope_attach',
            tick: event.tick,
            props: {
              levelId,
              chamberId: this.chamberAt(sample.player.position.x, sample.player.position.y),
              anchorId: anchor?.id ?? 'unknown',
              length: round1(event.length),
              impactOffsetX: point && center ? round1(point.x - center.x) : null,
              impactOffsetY: point && center ? round1(point.y - center.y) : null,
              vx: round1(sample.player.velocity.x),
              vy: round1(sample.player.velocity.y),
              grounded: sample.player.mode === 'grounded',
            },
          });
          break;
        }
        case 'ropeRelease': {
          const held = this.attached;
          this.attached = null;
          result.push({
            name: 'rope_release',
            tick: event.tick,
            props: {
              levelId,
              chamberId: this.chamberAt(snapshot.player.position.x, snapshot.player.position.y),
              anchorId: held ? (this.level.anchors[held.anchor]?.id ?? 'unknown') : 'unknown',
              vx: round1(event.velocity.x),
              vy: round1(event.velocity.y),
              heldTicks: held ? Math.max(0, event.tick - held.tick) : 0,
              cause: event.cause === 'timed' ? 'timed' : 'player',
            },
          });
          break;
        }
        case 'ropeInvalid':
          result.push({
            name: 'rope_invalid',
            tick: event.tick,
            props: {
              levelId,
              chamberId: this.chamberAt(event.at.x, event.at.y),
              reason: event.reason,
              x: round1(event.at.x),
              y: round1(event.at.y),
            },
          });
          break;
        case 'checkpoint':
          result.push({
            name: 'checkpoint',
            tick: event.tick,
            props: {
              levelId,
              checkpointId: event.id,
              runTicks: event.runTicks,
              lifeCount: this.life,
            },
          });
          break;
        case 'exit':
          if (!this.completed) {
            this.completed = true;
            result.push({
              name: 'level_complete',
              tick: event.tick,
              props: {
                levelId,
                runTicks: event.runTicks,
                deaths: this.runDeaths,
                lives: this.life,
              },
            });
          }
          break;
        default:
          // Other simulation events (jumps, stomps, ropeLock, etc.) are outside phase 1.
          break;
      }
    }

    this.observeChamber(snapshot, result);
    this.lastRunTicks = snapshot.runTick;
    this.previous = snapshot;
    return result;
  }

  /** Page hide or explicit playtest teardown. Record at most once per active run. */
  onQuit(snapshot: SimSnapshot): TelemetryEvent[] {
    if (!this.started || this.completed || this.quitRecorded || snapshot.runTick <= 0) return [];
    this.quitRecorded = true;
    return [
      {
        name: 'quit',
        tick: snapshot.tick,
        props: {
          levelId: this.level.telemetry?.levelId ?? this.level.id,
          chamberId: this.chamberAt(snapshot.player.position.x, snapshot.player.position.y),
          runTicks: snapshot.runTick,
        },
      },
    ];
  }

  private attemptStart(tick: number, fromCheckpoint: boolean): TelemetryEvent {
    this.quitRecorded = false;
    return {
      name: 'attempt_start',
      tick,
      props: {
        levelId: this.level.telemetry?.levelId ?? this.level.id,
        life: this.life,
        fromCheckpoint,
      },
    };
  }

  private clearRun(): void {
    this.runDeaths = 0;
    this.lastChamber = null;
    this.visitedChambers.clear();
    this.attached = null;
    this.completed = false;
    this.quitRecorded = false;
  }

  private chamberAt(x: number, y: number): string {
    const match = this.level.chambers?.find(
      (c) =>
        x >= c.region.min.x && x <= c.region.max.x && y >= c.region.min.y && y <= c.region.max.y,
    );
    return match?.id ?? 'none';
  }

  private observeChamber(snapshot: SimSnapshot, result: TelemetryEvent[]): void {
    if (this.completed) return;
    const id = this.chamberAt(snapshot.player.position.x, snapshot.player.position.y);
    if (id === this.lastChamber) return;
    this.lastChamber = id === 'none' ? null : id;
    if (id === 'none') return;
    const firstThisRun = !this.visitedChambers.has(id);
    this.visitedChambers.add(id);
    result.push({
      name: 'chamber_enter',
      tick: snapshot.tick,
      props: {
        levelId: this.level.telemetry?.levelId ?? this.level.id,
        chamberId: id,
        firstThisRun,
        runTicks: snapshot.runTick,
      },
    });
  }
}

/** Quantize to 0.1 world meters (or m/s) without negative zero. */
function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}
