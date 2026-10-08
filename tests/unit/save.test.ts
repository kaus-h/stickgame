import { describe, expect, it } from 'vitest';
import {
  decodeSave,
  emptySave,
  encodeSave,
  memoryStorage,
  migrate,
  recordRun,
  SAVE_VERSION,
  SaveStore,
  SaveVersionError,
  type Migration,
  type StorageService,
} from '../../src/platform';

describe('save schema (GMR-48)', () => {
  it('round-trips the current version', () => {
    const data = {
      ...emptySave(),
      levels: { 'lab-01': recordRun(undefined, { cleared: true, ticks: 900, deaths: 3 }) },
    };
    expect(decodeSave(encodeSave(data))).toEqual(data);
  });

  it('migrates the unversioned pre-release shape to the current version', () => {
    const legacy = { levels: { '1-1': { cleared: true, bestTicks: 1200 } } };
    const out = decodeSave(JSON.stringify(legacy));
    expect(out?.version).toBe(SAVE_VERSION);
    expect(out?.levels['1-1']).toMatchObject({ cleared: true, bestTicks: 1200, totalDeaths: 0 });
    expect(out?.settings.assist).toBe('standard');
  });

  it('runs a multi-step upgrade chain in order and validates every step', () => {
    const chain: Record<number, Migration> = {
      1: (d) => ({ ...d, version: 2, volume: undefined, masterVolume: d.volume }),
      2: (d) => ({ ...d, version: 3, renamed: true }),
    };
    const out = migrate({ version: 1, volume: 0.5 }, 3, chain);
    expect(out).toMatchObject({ version: 3, masterVolume: 0.5, renamed: true });
    expect(() => migrate({ version: 1 }, 3, { 1: (d) => ({ ...d, version: 3 }) })).toThrow(
      SaveVersionError,
    );
    expect(() => migrate({ version: 9 }, 3, chain)).toThrow('newer');
  });

  it('repairs malformed fields instead of failing', () => {
    const out = decodeSave(
      JSON.stringify({
        version: 1,
        levels: { ok: { cleared: true, bestTicks: -5, medals: ['gold', 7] }, '': {} },
        settings: { masterVolume: 9, reducedMotion: 'sideways', assist: 'aimbot' },
        ghosts: { ok: 42 },
      }),
    );
    expect(out?.levels).toEqual({
      ok: { cleared: true, bestTicks: null, fewestDeaths: null, totalDeaths: 0, medals: ['gold'] },
    });
    expect(out?.settings).toMatchObject({
      masterVolume: 1,
      reducedMotion: 'system',
      assist: 'standard',
    });
    expect(out?.ghosts).toEqual({});
  });

  it('rejects text that is not a save at all', () => {
    expect(decodeSave('{not json')).toBeNull();
    expect(decodeSave('[1,2]')).toBeNull();
    expect(decodeSave(null)).toBeNull();
  });

  it('keeps bests: fastest time and fewest deaths across clears; deaths always accumulate', () => {
    let r = recordRun(undefined, { cleared: false, ticks: 0, deaths: 4 });
    r = recordRun(r, { cleared: true, ticks: 1500, deaths: 2 });
    r = recordRun(r, { cleared: true, ticks: 1300, deaths: 5 });
    expect(r).toMatchObject({ cleared: true, bestTicks: 1300, fewestDeaths: 2, totalDeaths: 11 });
  });
});

describe('SaveStore', () => {
  it('survives a reload with the same storage', async () => {
    const storage = memoryStorage();
    const a = new SaveStore(storage);
    await a.load();
    a.recordRun('lab-01', { cleared: true, ticks: 800, deaths: 1 });
    a.updateSettings({ muted: true });
    await a.flush();
    const b = new SaveStore(storage);
    const data = await b.load();
    expect(b.source).toBe('main');
    expect(data.levels['lab-01']?.bestTicks).toBe(800);
    expect(data.settings.muted).toBe(true);
  });

  it('falls back to the backup when the main copy is corrupt, and repairs it', async () => {
    const storage = memoryStorage();
    const a = new SaveStore(storage);
    await a.load();
    a.recordRun('lab-01', { cleared: true, ticks: 800, deaths: 1 });
    a.recordRun('lab-01', { cleared: true, ticks: 700, deaths: 1 }); // first write is now the backup
    await a.flush();
    await storage.save('save', '{"version":1,"levels":'); // torn write
    const b = new SaveStore(storage);
    const data = await b.load();
    expect(b.source).toBe('backup');
    expect(data.levels['lab-01']?.bestTicks).toBe(800);
    await b.flush();
    expect(decodeSave(await storage.load('save'))).not.toBeNull();
  });

  it('plays on with a fresh save when storage is unavailable (private browsing)', async () => {
    const broken: StorageService = {
      load: () => Promise.reject(new Error('SecurityError')),
      save: () => Promise.reject(new Error('QuotaExceeded')),
    };
    const store = new SaveStore({
      load: (k) => broken.load(k).catch(() => null),
      save: (k, v) => broken.save(k, v).catch(() => undefined),
    });
    const data = await store.load();
    expect(store.source).toBe('new');
    store.recordRun('lab-01', { cleared: true, ticks: 900, deaths: 0 });
    await store.flush(); // never throws
    expect(store.current.levels['lab-01']?.cleared).toBe(true);
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('a throwing storage never reaches gameplay', async () => {
    const store = new SaveStore({
      load: () => Promise.resolve(null),
      save: () => Promise.reject(new Error('disk full')),
    });
    await store.load();
    store.updateSettings({ sfxVolume: 0.3 });
    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.current.settings.sfxVolume).toBe(0.3);
  });
});
