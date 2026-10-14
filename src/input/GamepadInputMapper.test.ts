import { describe, expect, it } from 'vitest';
import type { Intent } from '../core';
import { GamepadInputMapper, type GamepadState } from './GamepadInputMapper';

function state(axes = [0, 0, 0, 0], down: number[] = []): GamepadState {
  return {
    index: 0,
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: down.includes(i),
      value: Number(down.includes(i)),
    })),
  };
}

function setup() {
  const intents: Intent[] = [];
  let activity = 0;
  const pad = new GamepadInputMapper(
    (i) => intents.push(i),
    7,
    () => activity++,
  );
  return { pad, take: () => intents.splice(0), activity: () => activity };
}

describe('gamepad targeting v2', () => {
  it('an idle connected pad cannot take over another device; deadzone noise stays quiet', () => {
    const { pad, take, activity } = setup();
    pad.poll([state()]);
    pad.poll([state([0.19, 0, 0.1, 0.1])]);
    expect(take()).toEqual([]);
    expect(activity()).toBe(0);
  });

  it('right stick point-selects before RT fires; centered stick emits a neutral direction', () => {
    const { pad, take } = setup();
    pad.poll([state([0, 0, 0.6, -0.8], [7])]);
    expect(take()).toEqual([
      { type: 'ropePoint', direction: { x: 0.6, y: -0.8 } },
      { type: 'ropePress' },
    ]);
    pad.poll([state([0, 0, 0.6, -0.8], [7])]);
    expect(take()).toEqual([]);
    pad.poll([state()]);
    expect(take()).toEqual([
      { type: 'ropePoint', direction: { x: 0, y: 0 } },
      { type: 'ropeRelease' },
    ]);
  });

  it('move and jump overlap rope; disconnect releases each held verb', () => {
    const { pad, take } = setup();
    pad.poll([state([1, 0, 0, 0], [0, 7])]);
    expect(take()).toEqual([
      { type: 'ropePoint', direction: { x: 0, y: 0 } },
      { type: 'move', axis: 1 },
      { type: 'jumpPress' },
      { type: 'ropePress' },
    ]);
    pad.poll([]);
    expect(take()).toEqual([
      { type: 'move', axis: 0 },
      { type: 'jumpRelease' },
      { type: 'ropeRelease' },
    ]);
  });

  it('remapping RT to RB releases the old hold and ignores RT thereafter', () => {
    const { pad, take } = setup();
    pad.poll([state([], [7])]);
    take();
    pad.setRopeButton(5);
    expect(take()).toEqual([{ type: 'ropeRelease' }]);
    pad.poll([state([], [7])]);
    expect(take()).toEqual([]);
    pad.poll([state([], [5])]);
    expect(take()).toEqual([
      { type: 'ropePoint', direction: { x: 0, y: 0 } },
      { type: 'ropePress' },
    ]);
  });

  it('Start emits one pause intent per press even if many frames pass', () => {
    const { pad, take } = setup();
    pad.poll([state([], [9])]);
    pad.poll([state([], [9])]);
    expect(take().filter((i) => i.type === 'pause')).toHaveLength(1);
    pad.poll([state()]);
    take();
    pad.poll([state([], [9])]);
    expect(take().filter((i) => i.type === 'pause')).toHaveLength(1);
  });
});
