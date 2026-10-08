/**
 * Save file schema (GMR-48). Local-first, versioned JSON. Every field is validated on load and
 * anything malformed is repaired to its default instead of failing, so a damaged save never
 * blocks play; the store also keeps the previous good copy as a backup.
 */

export const SAVE_VERSION = 1;

export interface LevelRecord {
  readonly cleared: boolean;
  /** Fastest clear in simulation ticks (60 Hz), or null if never cleared. */
  readonly bestTicks: number | null;
  /** Fewest deaths in a clearing run, or null. */
  readonly fewestDeaths: number | null;
  /** Total deaths ever on this level (shown as tally marks; never punishes). */
  readonly totalDeaths: number;
  /** Medal ids earned (mastery systems, GMR-65). */
  readonly medals: readonly string[];
}

export type ReducedMotion = 'system' | 'on' | 'off';

export interface Settings {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly musicVolume: number;
  readonly muted: boolean;
  readonly reducedMotion: ReducedMotion;
  /** Mobile control scheme id (GMR-27), or null for the platform default. */
  readonly touchScheme: string | null;
  /** Opt-in aim assist tier (GMR-27); 'standard' means none. */
  readonly assist: 'standard' | 'wide-select' | 'snap';
}

export interface SaveData {
  readonly version: number;
  readonly levels: Readonly<Record<string, LevelRecord>>;
  readonly settings: Settings;
  /** Encoded replays (GMR-29 format) of the best run per level, for the local best ghost. */
  readonly ghosts: Readonly<Record<string, string>>;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.6,
  muted: false,
  reducedMotion: 'system',
  touchScheme: null,
  assist: 'standard',
};

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, levels: {}, settings: DEFAULT_SETTINGS, ghosts: {} };
}

export const EMPTY_LEVEL: LevelRecord = {
  cleared: false,
  bestTicks: null,
  fewestDeaths: null,
  totalDeaths: 0,
  medals: [],
};

/** A migration takes the data of version N and returns version N + 1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Upgrade registry: MIGRATIONS[n] turns a version-n save into version n+1. Version 0 is the
 * pre-release unversioned shape (no "version" key): a bare `{ levels }` map.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: (d) => ({ ...d, version: 1, settings: d.settings ?? {}, ghosts: d.ghosts ?? {} }),
};

export class SaveVersionError extends Error {}

/** Run migrations from the data's version up to `target`. Newer-than-known saves are refused. */
export function migrate(
  raw: Record<string, unknown>,
  target = SAVE_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  let data = raw;
  let v = typeof data.version === 'number' ? data.version : 0;
  if (v > target)
    throw new SaveVersionError(`save version ${String(v)} is newer than ${String(target)}`);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new SaveVersionError(`no migration from version ${String(v)}`);
    data = step(data);
    const next = typeof data.version === 'number' ? data.version : NaN;
    if (next !== v + 1)
      throw new SaveVersionError(`migration ${String(v)} produced ${String(next)}`);
    v = next;
  }
  return data;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const intOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

/** Repair a migrated object into a valid SaveData; unknown keys are dropped. */
export function sanitize(data: Record<string, unknown>): SaveData {
  const levels: Record<string, LevelRecord> = {};
  if (isRecord(data.levels)) {
    for (const [id, r] of Object.entries(data.levels)) {
      if (!isRecord(r) || id.length === 0 || id.length > 64) continue;
      levels[id] = {
        cleared: r.cleared === true,
        bestTicks: intOrNull(r.bestTicks),
        fewestDeaths: intOrNull(r.fewestDeaths),
        totalDeaths: intOrNull(r.totalDeaths) ?? 0,
        medals: Array.isArray(r.medals)
          ? r.medals.filter((m): m is string => typeof m === 'string').slice(0, 16)
          : [],
      };
    }
  }
  const s = isRecord(data.settings) ? data.settings : {};
  const settings: Settings = {
    masterVolume: num(s.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: num(s.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
    musicVolume: num(s.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
    muted: s.muted === true,
    reducedMotion:
      s.reducedMotion === 'on' || s.reducedMotion === 'off' ? s.reducedMotion : 'system',
    touchScheme: typeof s.touchScheme === 'string' ? s.touchScheme : null,
    assist: s.assist === 'wide-select' || s.assist === 'snap' ? s.assist : 'standard',
  };
  const ghosts: Record<string, string> = {};
  if (isRecord(data.ghosts)) {
    for (const [id, g] of Object.entries(data.ghosts)) {
      // Ghost replays are small (a few hundred bytes); refuse absurd sizes.
      if (typeof g === 'string' && g.length < 200_000) ghosts[id] = g;
    }
  }
  return { version: SAVE_VERSION, levels, settings, ghosts };
}

/** Parse, migrate and repair. Returns null when the text is not a usable save at all. */
export function decodeSave(text: string | null): SaveData | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  try {
    return sanitize(migrate(parsed));
  } catch {
    return null;
  }
}

export function encodeSave(data: SaveData): string {
  return JSON.stringify(data);
}

export interface RunResult {
  readonly cleared: boolean;
  readonly ticks: number;
  readonly deaths: number;
}

/** Fold one finished run into a level record (pure; the store persists the result). */
export function recordRun(prev: LevelRecord | undefined, run: RunResult): LevelRecord {
  const r = prev ?? EMPTY_LEVEL;
  if (!run.cleared) return { ...r, totalDeaths: r.totalDeaths + run.deaths };
  return {
    ...r,
    cleared: true,
    bestTicks: r.bestTicks === null ? run.ticks : Math.min(r.bestTicks, run.ticks),
    fewestDeaths: r.fewestDeaths === null ? run.deaths : Math.min(r.fewestDeaths, run.deaths),
    totalDeaths: r.totalDeaths + run.deaths,
  };
}
