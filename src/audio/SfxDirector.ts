import type { SimEvent, SimSnapshot } from '../sim';

/** What the director needs from the engine (so it can be tested without Web Audio). */
export interface SfxSink {
  play(name: string, opts?: { gain?: number; rate?: number }): void;
}

/**
 * Maps simulation events and state changes to sounds (doc 08 core events). Every sound here has a
 * visual equivalent on screen (jump and land poses, rope dash and highlighter, red reticle, death
 * splat and cross, retry snap), so audio is never the only channel.
 */
export class SfxDirector {
  private wasTaut = false;

  constructor(private readonly sink: SfxSink) {}

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.sink.play('jump');
          break;
        case 'stomp':
          this.sink.play('stomp');
          break;
        case 'targetHit':
          this.sink.play('stomp', { rate: 1.35 });
          break;
        case 'targetBlocked':
          this.sink.play('land');
          break;
        case 'targetBroken':
          this.sink.play('stomp');
          this.sink.play('ropeRelease');
          break;
        case 'land':
          // Soft landings are silent; hard ones thud. Speed is the real closing speed.
          if (e.speed > 2) {
            this.sink.play('land', {
              gain: Math.min(1, e.speed / 20),
              rate: 1.1 - Math.min(0.3, e.speed / 80),
            });
          }
          break;
        case 'ropeAttach':
          this.sink.play('ropeShot');
          this.sink.play('ropeConnect', { rate: 1.2 - Math.min(0.4, e.length / 30) });
          break;
        case 'ropeInvalid':
          this.sink.play('ropeShot', { gain: 0.6 });
          this.sink.play('ropeInvalid');
          break;
        case 'ropeRelease':
          this.sink.play('ropeRelease');
          this.wasTaut = false;
          break;
        case 'death':
          this.sink.play('death');
          this.wasTaut = false;
          break;
        case 'reset':
          this.sink.play('retry');
          this.wasTaut = false;
          break;
        case 'exit':
          this.sink.play('exit');
          break;
        case 'ropeLock':
        case 'exitMiss':
          // Spatial red-pen feedback carries the miss; reserve the exit cue for success.
          break;
      }
    }
  }

  /** Rope tension: a twang when a locked rope snaps taut (pitch follows the radius). */
  onFrame(s: SimSnapshot): void {
    const rope = s.rope;
    const taut = rope !== null && rope.locked && rope.taut;
    if (rope && taut && !this.wasTaut) {
      const speed = Math.hypot(s.player.velocity.x, s.player.velocity.y);
      this.sink.play('ropeTaut', {
        gain: Math.min(1, 0.3 + speed / 25),
        rate: 1.4 - Math.min(0.6, rope.length / 18),
      });
    }
    this.wasTaut = taut;
  }
}
