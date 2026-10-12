import { describe, expect, it } from 'vitest';
import { filmRange, parseFilmArgs } from '../../scripts/film-options.mjs';

const solution = {
  totalTicks: 960,
  chambers: [
    { id: '1-1-c1', startTick: 0 },
    { id: '1-1-c2', startTick: 155 },
  ],
};

describe('film arguments and capture range', () => {
  it('defaults to the whole route at 15 fps and half scale', () => {
    const options = parseFilmArgs(['1-1']);
    expect(options).toEqual({ id: '1-1', from: '0', every: 4, scale: 0.5 });
    expect(filmRange(options, solution)).toEqual({ start: 0, end: 960 });
  });

  it('resolves a chamber start and clamps duration to the recorded route', () => {
    const options = parseFilmArgs(['1-1', '--from', '1-1-c2', '--ticks', '1000']);
    expect(filmRange(options, solution)).toEqual({ start: 155, end: 960 });
  });

  it('supports a tick start, sampling interval and output scale', () => {
    const options = parseFilmArgs([
      'lab-01',
      '--from',
      '60',
      '--ticks',
      '120',
      '--every',
      '8',
      '--scale',
      '0.25',
    ]);
    expect(filmRange(options, solution)).toEqual({ start: 60, end: 180 });
    expect(options.every).toBe(8);
    expect(options.scale).toBe(0.25);
  });

  it.each([
    [],
    ['../1-1'],
    ['1-1', '--wat'],
    ['1-1', '--from'],
    ['1-1', '--every', '0'],
    ['1-1', '--ticks', 'NaN'],
    ['1-1', '--ticks', '1.5'],
    ['1-1', '--scale', '0'],
    ['1-1', '--scale', '2'],
    ['1-1', '1-2'],
  ])('rejects invalid arguments %j', (...argv) => {
    expect(() => parseFilmArgs(argv)).toThrow();
  });

  it('rejects unknown chambers and out-of-range starts', () => {
    for (const from of ['missing', '960', '-1', '1.5']) {
      expect(() => filmRange(parseFilmArgs(['1-1', '--from', from]), solution)).toThrow();
    }
  });
});
