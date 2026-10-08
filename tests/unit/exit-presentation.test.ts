import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import type { ExitAttempt, ExitDef, ExitSide } from '../../src/sim';
import { entryMarks, exitMissMessage } from '../../src/render/exit';

const exit: ExitDef = {
  id: 'mouth',
  family: 'wide',
  min: vec2(2, 3),
  max: vec2(6, 11),
  entry: {
    side: 'left',
    angle: { min: 10, max: 30 },
    speed: { min: 4, max: 12 },
    alignment: { min: 0.25, max: 0.75 },
  },
};
const attempt: ExitAttempt = {
  exitId: 'mouth',
  family: 'wide',
  at: vec2(2, 5),
  velocity: vec2(15, 0),
  speed: 15,
  angleCos: 1,
  alignment: 0.25,
  accepted: false,
  reason: 'speed',
};

describe('compartment presentation', () => {
  it.each([
    ['left', vec2(2, 5), vec2(2, 9)],
    ['right', vec2(6, 5), vec2(6, 9)],
    ['top', vec2(3, 3), vec2(5, 3)],
    ['bottom', vec2(3, 11), vec2(5, 11)],
  ] as const)(
    'maps %s alignment to the actual mouth in down/right order',
    (side: ExitSide, first, last) => {
      expect(entryMarks({ ...exit, entry: { ...exit.entry, side } })).toEqual([first, last]);
    },
  );

  it('tells the player which side of the speed window was missed', () => {
    expect(exitMissMessage(attempt, exit)).toBe('Too fast');
    expect(exitMissMessage({ ...attempt, speed: 2 }, exit)).toBe('Too slow');
  });

  it('distinguishes grazing entry from arriving below the minimum angle', () => {
    expect(
      exitMissMessage({ ...attempt, reason: 'angle', angleCos: Math.cos(Math.PI / 4) }, exit),
    ).toBe('Enter straighter');
    expect(exitMissMessage({ ...attempt, reason: 'angle', angleCos: 1 }, exit)).toBe(
      'Use the marked entry angle',
    );
    expect(exitMissMessage({ ...attempt, reason: 'alignment' }, exit)).toBe(
      'Aim between the entry marks',
    );
  });
});
