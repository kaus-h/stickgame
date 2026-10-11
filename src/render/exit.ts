import { vec2, type Vec2 } from '../core';
import type { ExitAttempt, ExitDef, LevelDef } from '../sim';

/** Alignment is measured down vertical mouths and right across horizontal mouths. */
export function entryMarks(exit: ExitDef): readonly [Vec2, Vec2] {
  const { min, max, entry } = exit;
  const vertical = entry.side === 'left' || entry.side === 'right';
  const point = (alignment: number): Vec2 =>
    vec2(
      vertical ? (entry.side === 'left' ? min.x : max.x) : min.x + (max.x - min.x) * alignment,
      vertical ? min.y + (max.y - min.y) * alignment : entry.side === 'top' ? min.y : max.y,
    );
  return [point(entry.alignment.min), point(entry.alignment.max)];
}

/** Feedback explains the failed window without changing the attempt or its motion. */
export function exitMissMessage(attempt: ExitAttempt, exit: LevelDef['exit']): string {
  const entry = exit && 'entry' in exit ? exit.entry : null;
  switch (attempt.reason) {
    case 'speed':
      if (!entry?.speed) return '';
      return attempt.speed > entry.speed.max ? 'Too fast' : 'Too slow';
    case 'angle':
      return entry && attempt.angleCos > Math.cos((entry.angle.min * Math.PI) / 180)
        ? 'Use the marked entry angle'
        : 'Enter straighter';
    case 'alignment':
      return 'Aim between the entry marks';
    case 'wrong-side':
      return 'Enter from the arrow';
    default:
      return 'Give yourself more clearance';
  }
}

/**
 * Speed streaks behind the entry arrow's tail (GMR-56 exit grammar, the comic "whoosh"): 3 = come
 * in from a fast swing, 1 = faster than a run, 0 = run speed or slower, or no speed rule. The blind
 * readability test showed a single chevron read as arrow fletching, so slow needs no mark at all
 * and the miss text after an attempt covers "Too fast".
 */
export function speedStreaks(
  speed: { readonly min: number; readonly max: number } | undefined,
): 0 | 1 | 3 {
  if (!speed || speed.max <= 9) return 0;
  return speed.min >= 15 ? 3 : 1;
}

/** One line for the debug overlay: the exit's family and windows, which signage never spells out. */
export function exitSpec(exit: LevelDef['exit']): string {
  if (!exit) return 'exit none';
  if (!('entry' in exit)) return 'exit (legacy box)';
  const { entry } = exit;
  const family = 'family' in exit ? exit.family : 'wide';
  const speed = entry.speed
    ? ` | speed ${String(entry.speed.min)}–${String(entry.speed.max)} m/s`
    : '';
  return `exit ${family} from ${entry.side} | angle ${String(entry.angle.min)}–${String(entry.angle.max)}° | align ${String(entry.alignment.min)}–${String(entry.alignment.max)}${speed}`;
}
