import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, emptySave, recordRun } from '../../src/platform';

describe('targeting v2 saved run provenance', () => {
  it('legacy version-3 records and PBs migrate with unknown tags', () => {
    const data = decodeSave(
      JSON.stringify({
        version: 3,
        levels: { lab: { cleared: true, bestTicks: 100 } },
        pbs: { lab: { ticks: 100, splits: [], replay: '{}', levelVersion: 'version' } },
      }),
    );
    expect(data?.version).toBe(4);
    expect(data?.levels.lab).toMatchObject({
      bestTicks: 100,
      bestInputDevice: 'unknown',
      lastInputDevice: 'unknown',
    });
    expect(data?.pbs.lab?.inputDevice).toBe('unknown');
    expect(data?.settings.gamepadRopeButton).toBe(7);
  });

  it('fastest-clear provenance stays with the fastest run, while last-run provenance updates', () => {
    let result = recordRun(undefined, {
      cleared: true,
      ticks: 100,
      deaths: 0,
      inputDevice: 'mouse',
    });
    result = recordRun(result, { cleared: true, ticks: 110, deaths: 0, inputDevice: 'pad' });
    expect(result).toMatchObject({
      bestTicks: 100,
      bestInputDevice: 'mouse',
      lastInputDevice: 'pad',
    });
    result = recordRun(result, { cleared: true, ticks: 90, deaths: 0, inputDevice: 'touch' });
    expect(result).toMatchObject({
      bestTicks: 90,
      bestInputDevice: 'touch',
      lastInputDevice: 'touch',
    });
    result = recordRun(result, { cleared: true, ticks: 90, deaths: 0, inputDevice: 'pad' });
    expect(result.bestInputDevice).toBe('touch');
  });

  it('saves button/tap schemes, remapping and PB provenance across reloads', () => {
    const initial = emptySave();
    const loaded = decodeSave(
      encodeSave({
        ...initial,
        settings: { ...initial.settings, touchScheme: 'tap', gamepadRopeButton: 5 },
        pbs: {
          lab: {
            ticks: 100,
            splits: [],
            replay: '{}',
            levelVersion: 'version',
            inputDevice: 'pad',
          },
        },
      }),
    );
    expect(loaded?.settings).toMatchObject({ touchScheme: 'tap', gamepadRopeButton: 5 });
    expect(loaded?.pbs.lab?.inputDevice).toBe('pad');
  });

  it('repairs malformed tags and unavailable Rope mappings', () => {
    const loaded = decodeSave(
      JSON.stringify({
        version: 4,
        settings: { gamepadRopeButton: 0 },
        levels: { lab: { bestInputDevice: 'wheel', lastInputDevice: 3 } },
      }),
    );
    expect(loaded?.settings.gamepadRopeButton).toBe(7);
    expect(loaded?.levels.lab).toMatchObject({
      bestInputDevice: 'unknown',
      lastInputDevice: 'unknown',
    });
  });
});
