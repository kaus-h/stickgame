import type { ExitAttempt, SimEvent, SimSnapshot } from '../../sim';
import { BUILD_HASH } from '../../core';
import type { RaceView, RuntimeStats } from '../frame';

const f2 = (n: number): string => n.toFixed(2);
const v2 = (v: { x: number; y: number }): string => `${f2(v.x)}, ${f2(v.y)}`;
const speed = (v: { x: number; y: number }): number => Math.sqrt(v.x * v.x + v.y * v.y);

/** One structured, human-readable line per simulation event (GMR-28 event log). */
export function formatEvent(e: SimEvent): string {
  const t = `#${String(e.tick).padStart(6, ' ')}`;
  switch (e.type) {
    case 'reset':
      return `${t} reset`;
    case 'jump':
      return `${t} jump`;
    case 'stomp':
      return `${t} stomp ${e.enemy} at ${v2(e.at)} incoming ${v2(e.velocity)} rebound ${v2(e.rebound)} m/s`;
    case 'land':
      return `${t} land ${e.speed.toFixed(1)} m/s`;
    case 'death':
      return `${t} death ${e.cause}${e.solid ? ` (${e.solid})` : ''}${e.enemy ? ` enemy ${e.enemy}` : ''} at ${v2(e.at)} ${speed(e.velocity).toFixed(1)} m/s${e.rope ? ` rope a${String(e.rope.anchor)} L${f2(e.rope.length)}` : ''}`;
    case 'exit':
      return `${t} exit after ${(e.attemptTicks / 60).toFixed(2)} s${e.attempt ? ` ${attemptLine(e.attempt)}` : ''}`;
    case 'checkpoint':
      return `${t} checkpoint ${String(e.index)} (${e.id}) split ${(e.runTicks / 60).toFixed(2)} s`;
    case 'respawn':
      return `${t} respawn at checkpoint ${String(e.checkpoint)}${e.voluntary ? ' (respawn key)' : ''}`;
    case 'lifeEnd':
      return `${t} life ${String(e.life)} ended (${e.reason}) after ${(e.lifeTicks / 60).toFixed(2)} s, run ${(e.runTicks / 60).toFixed(2)} s`;
    case 'exitMiss':
      return `${t} exit miss ${attemptLine(e.attempt)}`;
    case 'ropeAttach':
      return `${t} rope attach a${String(e.anchor)} d${f2(e.length)}`;
    case 'ropeLock':
      return `${t} rope lock L${f2(e.length)}`;
    case 'ropeRelease':
      return `${t} rope release${e.cause === 'timed' ? ' (timed anchor off)' : ''} v ${v2(e.velocity)} (${speed(e.velocity).toFixed(1)} m/s)`;
    case 'anchorSpent':
      return `${t} anchor ${String(e.anchor)} spent (one-use)`;
    case 'ropeInvalid':
      return `${t} rope invalid ${e.reason} at ${v2(e.at)}`;
  }
}

/** The text panel: timing, player, rope, target, contacts, failure context, counters. */
export function formatOverlay(s: SimSnapshot, stats: RuntimeStats): string[] {
  const p = s.player;
  const rope = s.rope;
  const t = s.target;
  const d = s.lastDeath;
  return [
    `build ${BUILD_HASH}  sim ${String(stats.simHz)} Hz  steps/frame ${String(stats.stepsLastFrame)}  alpha ${f2(stats.alpha)}  frame ${stats.frameMsAvg.toFixed(1)}/${stats.frameMsMax.toFixed(1)} ms  step ${stats.simStepMsAvg.toFixed(3)} ms${stats.paused ? '  PAUSED' : ''}`,
    `tick ${String(s.tick)}  run ${String(s.runTick)}  life ${String(s.lifeTick)} (#${String(s.lives)})  level ${String(s.levelTick)}  checkpoint ${String(s.checkpoint)}  respawns ${String(s.respawns)}  attempt ${String(s.attemptTick)}  resets ${String(s.resets)}  deaths ${String(s.deaths)}  bodies ${String(stats.bodies)}  joints ${String(stats.joints)}`,
    `player ${p.mode}  pos ${v2(p.position)}  vel ${v2(p.velocity)}  |v| ${speed(p.velocity).toFixed(2)}  facing ${p.facing > 0 ? '→' : '←'}`,
    rope
      ? `rope a${String(rope.anchor)}  ${rope.locked ? 'locked' : 'paying out'} ${rope.taut ? 'taut' : 'slack'}  L ${rope.length.toFixed(3)} m  pivot ${v2(rope.point)}  since #${String(rope.attachedTick)}`
      : 'rope —',
    t
      ? `target ${t.valid ? 'valid' : t.reason}${t.anchor === null ? '' : ` a${String(t.anchor)}`}${t.impact ? ` impact ${v2(t.impact)}` : ''}${t.distance === null ? '' : ` d ${t.distance.toFixed(3)} m`}${t.snapped ? ' SNAPPED' : ''}  assist ${s.assist}`
      : `target —  assist ${s.assist}`,
    `selection ${s.selection.mode}  point ${v2(s.selection.direction)}  highlight ${s.selection.anchor ?? '—'}`,
    anchorLine(s),
    s.enemies.length
      ? `enemies ${s.enemies.map((e) => `${e.id} ${e.alive ? 'alive' : 'defeated'} at ${v2(e.position)} size ${v2(e.size)} v ${v2(e.velocity)} facing ${String(e.facing)}`).join(' | ')}`
      : 'enemies —',
    s.contacts.length
      ? `contacts ${s.contacts.map((c) => `${c.solid}${c.kind === 'hazard' ? '!' : ''} n(${f2(c.normal.x)},${f2(c.normal.y)}) ${c.speed.toFixed(1)}`).join('  ')}`
      : 'contacts —',
    d
      ? `last death #${String(d.tick)} ${d.cause}${d.solid ? ` (${d.solid})` : ''}${d.enemy ? ` enemy ${d.enemy}` : ''} at ${v2(d.at)} ${speed(d.velocity).toFixed(1)} m/s${d.rope ? ` tethered a${String(d.rope.anchor)}` : ''}`
      : 'last death —',
    s.completion
      ? `completion #${String(s.completion.tick)} ${(s.completion.attemptTicks / 60).toFixed(2)} s ${attemptLine(s.completion)}`
      : 'completion —',
    s.lastExitAttempt
      ? `last exit #${String(s.lastExitAttempt.tick)} ${attemptLine(s.lastExitAttempt)}`
      : 'last exit —',
  ];
}

/** Racing state (GMR-103): life clock, PB splits and whether the PB ghost is on. */
export function formatRace(s: SimSnapshot, race: RaceView | undefined): string {
  if (!race) return `race —  life ${String(s.lifeTick)}  lives ${String(s.lives)}`;
  const pb = race.pb
    ? `pb ${String(race.pb.ticks)} splits [${race.pb.splits.map((v) => (v === null ? '—' : String(v))).join(', ')}]`
    : 'pb —';
  const ghost = `ghost ${race.ghostEnabled ? 'on' : 'off'}${race.ghost ? ` @${String(race.ghost.current.runTick)}` : race.pb ? ' (idle)' : ''}`;
  return `race life ${String(s.lifeTick)}  lives ${String(s.lives)}  ${pb}  ${ghost}`;
}

function attemptLine(a: ExitAttempt): string {
  return `${a.exitId} ${a.family} ${a.accepted ? 'accepted' : (a.reason ?? 'miss')} at ${v2(a.at)} v(${v2(a.velocity)}) ${f2(a.speed)} m/s cos ${a.angleCos.toFixed(3)} alignment ${a.alignment.toFixed(3)}`;
}

/** Path state of the anchor in play (rope, else target), for moving-anchor debugging (GMR-26). */
function anchorLine(s: SimSnapshot): string {
  const i = s.rope?.anchor ?? s.target?.anchor ?? null;
  if (i === null) return 'anchor —';
  const a = s.anchors[i];
  const v = s.anchorVelocities[i];
  if (!a || !v) return 'anchor —';
  return `anchor a${String(i)} at ${v2(a)} v ${v2(v)} (${speed(v).toFixed(2)} m/s)`;
}

/** Fixed-size ring of formatted events, newest last. */
export class EventLog {
  private readonly lines: string[] = [];
  private readonly raw: SimEvent[] = [];

  constructor(private readonly capacity = 200) {}

  push(events: readonly SimEvent[]): void {
    for (const e of events) {
      this.raw.push(e);
      this.lines.push(formatEvent(e));
      if (this.raw.length > this.capacity) {
        this.raw.shift();
        this.lines.shift();
      }
    }
  }

  tail(n: number): readonly string[] {
    return this.lines.slice(-n);
  }

  /** Structured events, for tools and tests. */
  events(): readonly SimEvent[] {
    return this.raw;
  }
}
