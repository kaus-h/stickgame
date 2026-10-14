import { describe, expect, it } from 'vitest';
import {
  decodeReplay,
  encodeReplay,
  RecordingIntentSource,
  ReplayError,
  type Intent,
  type Replay,
} from '../../src/core';

const replay: Replay = {
  version: 1,
  build: 'v2',
  level: 'lab',
  seed: 0,
  ticks: 3,
  inputDevice: 'pad',
  inputs: [
    {
      tick: 0,
      intents: [{ type: 'ropePoint', direction: { x: 0.6, y: -0.8 } }, { type: 'ropePress' }],
    },
    {
      tick: 1,
      intents: [{ type: 'ropeNeutral' }, { type: 'ropeTouch', target: { x: 12.5, y: 3 } }],
    },
    {
      tick: 2,
      intents: [{ type: 'ropePoint', direction: { x: 0, y: 0 } }, { type: 'ropeRelease' }],
    },
  ],
};

describe('targeting v2 additive replay contract', () => {
  it('new intents and provenance round-trip without changing v1', () => {
    const text = encodeReplay(replay);
    expect(JSON.parse(text)).toMatchObject({ v: 1, d: 'pad' });
    expect(decodeReplay(text, 'v2')).toEqual({ replay, buildMatches: true });
  });

  it('old v1 payloads retain identical tuples and omitted provenance', () => {
    const old = '{"v":1,"b":"old","l":"lab","s":0,"n":2,"i":[[0,["a",10,2],"r"],[1,"R"]]}';
    const decoded = decodeReplay(old, 'v2');
    expect(decoded.buildMatches).toBe(false);
    expect(decoded.replay.inputDevice).toBeUndefined();
    expect(encodeReplay(decoded.replay)).toBe(old);
  });

  it.each(['mouse', 'pad', 'touch', 'unknown'] as const)(
    'preserves %s provenance',
    (inputDevice) => {
      expect(decodeReplay(encodeReplay({ ...replay, inputDevice }), 'v2').replay.inputDevice).toBe(
        inputDevice,
      );
    },
  );

  it.each([
    { intent: ['q', 0], path: 'inputs[0].intents[0]' },
    { intent: ['q', null, 0], path: 'inputs[0].intents[0].direction.x' },
    { intent: ['t', 1, 'bad'], path: 'inputs[0].intents[0].target.y' },
    { intent: ['t', 1, 2, 3], path: 'inputs[0].intents[0]' },
  ])('rejects malformed additive tuples with an exact path', ({ intent, path }) => {
    try {
      decodeReplay(JSON.stringify({ v: 1, b: 'v2', l: 'lab', s: 0, n: 1, i: [[0, intent]] }), 'v2');
      expect.fail('malformed tuple decoded');
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayError);
      expect((error as ReplayError).path).toBe(path);
    }
  });

  it('rejects unknown device tags', () => {
    expect(() => decodeReplay(encodeReplay(replay).replace('"pad"', '"wheel"'), 'v2')).toThrow(
      'd: unknown input device',
    );
  });

  it('records independent target and direction vectors even if adapter objects mutate', () => {
    const direction = { x: 1, y: 0 };
    const target = { x: 3, y: 4 };
    const intents: Intent[] = [
      { type: 'ropePoint', direction },
      { type: 'ropeTouch', target },
    ];
    const recorder = new RecordingIntentSource({ poll: () => intents });
    recorder.poll(0);
    direction.x = 99;
    target.y = 99;
    const stored = recorder.finish({
      build: 'v2',
      level: 'lab',
      seed: 0,
      ticks: 1,
      inputDevice: 'touch',
    });
    expect(stored.inputs[0]?.intents).toEqual([
      { type: 'ropePoint', direction: { x: 1, y: 0 } },
      { type: 'ropeTouch', target: { x: 3, y: 4 } },
    ]);
  });
});
