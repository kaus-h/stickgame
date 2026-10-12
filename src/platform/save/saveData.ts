/**
 * Save file schema (GMR-48). Local-first, versioned JSON. Every field is validated on load and
 * anything malformed is repaired to its default instead of failing, so a damaged save never
 * blocks play; the store also keeps the previous good copy as a backup.
 */

export const SAVE_VERSION = 3;

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
  /** Total play ticks on this level across every run and session, restarts included (GMR-103). */
  readonly playTicks: number;
  /**
   * Time to first clear (GMR-103): playTicks at the first completion. Recorded once, never
   * overwritten; null if not cleared yet, or cleared before this was tracked.
   */
  readonly firstClearTicks: number | null;
}

/**
 * Personal best run (GMR-103): the run time, its checkpoint splits and the run as an input replay
 * (GMR-29 format), which drives the PB ghost. The replay is only trusted for the level version and
 * build it was recorded on; anything else is discarded by the app, never drawn wrong.
 */
export interface PersonalBest {
  /** Run time in simulation ticks. */
  readonly ticks: number;
  /** Run time at each checkpoint, by checkpoint index; null where the run skipped it. */
  readonly splits: readonly (number | null)[];
  /** Encoded replay (core/replay.ts). */
  readonly replay: string;
  /** levelFingerprint of the level the replay was recorded on. */
  readonly levelVersion: string;
}

export type ReducedMotion = 'system' | 'on' | 'off';

// Keep the save schema platform-only (AGENTS.md): this type mirrors the action names in
// src/input/bindings.ts but must not import from src/input across the platform layer boundary.
type BindableAction =
  | 'left'
  | 'right'
  | 'jump'
  | 'rope'
  | 'restart'
  | 'respawn'
  | 'pause'
  | 'ghost'
  | 'bodies'
  | 'clearBodies';

const BINDABLE_ACTIONS: readonly BindableAction[] = [
  'left',
  'right',
  'jump',
  'rope',
  'restart',
  'respawn',
  'pause',
  'ghost',
  'bodies',
  'clearBodies',
];

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
  /** Show the personal-best ghost (GMR-103); G toggles it. */
  readonly ghost: boolean;
  /** Show the death bodies (GMR-104); B toggles them. */
  readonly bodies: boolean;
  /** High contrast (GMR-50): darker pencil marks, brighter out-of-reach anchors, no scenery. */
  readonly highContrast: boolean;
  /** Larger aim reticle (GMR-50). */
  readonly largeReticle: boolean;
  /** Player keyboard overrides; an empty map means desktop defaults. */
  readonly keyBindings: Readonly<Partial<Record<BindableAction, readonly string[]>>>;
}

export interface SaveData {
  readonly version: number;
  readonly levels: Readonly<Record<string, LevelRecord>>;
  readonly settings: Settings;
  /** Personal best per level, with its splits and ghost replay (GMR-103). */
  readonly pbs: Readonly<Record<string, PersonalBest>>;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.6,
  muted: false,
  reducedMotion: 'system',
  touchScheme: null,
  assist: 'standard',
  ghost: true,
  bodies: true,
  highContrast: false,
  largeReticle: false,
  keyBindings: {},
};

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, levels: {}, settings: DEFAULT_SETTINGS, pbs: {} };
}

export const EMPTY_LEVEL: LevelRecord = {
  cleared: false,
  bestTicks: null,
  fewestDeaths: null,
  totalDeaths: 0,
  medals: [],
  playTicks: 0,
  firstClearTicks: null,
};

/** A migration takes the data of version N and returns version N + 1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Upgrade registry: MIGRATIONS[n] turns a version-n save into version n+1. Version 0 is the
 * pre-release unversioned shape (no "version" key): a bare `{ levels }` map.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: (d) => ({ ...d, version: 1, settings: d.settings ?? {}, ghosts: d.ghosts ?? {} }),
  // GMR-103: version-1 ghosts were bare replays with no splits or level version, so they cannot be
  // validated against the current level; they are dropped. Level records gain play time and time to
  // first clear (sanitize fills the defaults).
  1: (d) => {
    const next: Record<string, unknown> = { ...d, version: 2, pbs: {} };
    delete next.ghosts;
    return next;
  },
  // GMR-50: existing settings are preserved while key overrides start empty.
  2: (d) => ({
    ...d,
    version: 3,
    settings: { ...(isRecord(d.settings) ? d.settings : {}), keyBindings: {} },
  }),
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
        playTicks: intOrNull(r.playTicks) ?? 0,
        firstClearTicks: intOrNull(r.firstClearTicks),
      };
    }
  }
  const s = isRecord(data.settings) ? data.settings : {};
  const keyBindings: Partial<Record<BindableAction, readonly string[]>> = {};
  if (isRecord(s.keyBindings)) {
    for (const action of BINDABLE_ACTIONS) {
      const codes = s.keyBindings[action];
      if (!Array.isArray(codes)) continue;
      keyBindings[action] = codes.filter(
        (code): code is string =>
          typeof code === 'string' &&
          code.length > 0 &&
          code !== 'Tab' &&
          (code !== 'Escape' || action === 'pause'),
      );
    }
  }
  const settings: Settings = {
    masterVolume: num(s.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: num(s.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
    musicVolume: num(s.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
    muted: s.muted === true,
    reducedMotion:
      s.reducedMotion === 'on' || s.reducedMotion === 'off' ? s.reducedMotion : 'system',
    touchScheme: typeof s.touchScheme === 'string' ? s.touchScheme : null,
    assist: s.assist === 'wide-select' || s.assist === 'snap' ? s.assist : 'standard',
    ghost: s.ghost !== false,
    bodies: s.bodies !== false,
    highContrast: s.highContrast === true,
    largeReticle: s.largeReticle === true,
    keyBindings,
  };
  const pbs: Record<string, PersonalBest> = {};
  if (isRecord(data.pbs)) {
    for (const [id, pb] of Object.entries(data.pbs)) {
      const ok = sanitizePb(pb);
      if (ok && id.length > 0 && id.length <= 64) pbs[id] = ok;
    }
  }
  return { version: SAVE_VERSION, levels, settings, pbs };
}

/** Shape check only; whether the replay still fits the level and build is the app's call. */
function sanitizePb(pb: unknown): PersonalBest | null {
  if (!isRecord(pb)) return null;
  const ticks = intOrNull(pb.ticks);
  // Replays are small (a few kilobytes for minutes of play); refuse absurd sizes.
  if (ticks === null || ticks === 0) return null;
  if (typeof pb.replay !== 'string' || pb.replay.length === 0 || pb.replay.length >= 200_000)
    return null;
  if (typeof pb.levelVersion !== 'string' || !Array.isArray(pb.splits) || pb.splits.length > 64)
    return null;
  const splits = pb.splits.map((v) => intOrNull(v));
  return { ticks, splits, replay: pb.replay, levelVersion: pb.levelVersion };
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
  /** Play ticks on the level since the last record (restarts included), for time to first clear. */
  readonly playTicks?: number;
}

/** Fold one finished run into a level record (pure; the store persists the result). */
export function recordRun(prev: LevelRecord | undefined, run: RunResult): LevelRecord {
  const r = prev ?? EMPTY_LEVEL;
  const playTicks = r.playTicks + (run.playTicks ?? 0);
  if (!run.cleared) return { ...r, totalDeaths: r.totalDeaths + run.deaths, playTicks };
  return {
    ...r,
    cleared: true,
    playTicks,
    // Recorded once, at the first clear, and never overwritten.
    firstClearTicks: r.cleared ? r.firstClearTicks : playTicks,
    bestTicks: r.bestTicks === null ? run.ticks : Math.min(r.bestTicks, run.ticks),
    fewestDeaths: r.fewestDeaths === null ? run.deaths : Math.min(r.fewestDeaths, run.deaths),
    totalDeaths: r.totalDeaths + run.deaths,
  };
}
