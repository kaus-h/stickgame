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
