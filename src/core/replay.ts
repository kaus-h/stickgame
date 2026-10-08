import { parseAssistMode, type AssistMode } from './assist';
import type { Intent, IntentSource } from './intents';
import { vec2 } from './vec2';

/** Current replay payload version. Bump on any incompatible change to the shape below. */
export const REPLAY_VERSION = 1;

/** Intents applied on one simulation tick. Ticks with no intents are omitted. */
export interface ReplayInput {
  readonly tick: number;
  readonly intents: readonly Intent[];
}

/**
 * A recorded run: the inputs only, never the resulting states. Replaying them through the same
 * build reproduces the run exactly (doc 30 section 5).
 */
export interface Replay {
  readonly version: typeof REPLAY_VERSION;
  /** Build identifier the replay was recorded on (git hash or version string). */
  readonly build: string;
  /** Level id. */
  readonly level: string;
  readonly seed: number;
  /**
   * Aim-assist tier the run was played with (GMR-27). Absent means `standard`. Playback must use
   * the same tier, since assists change which anchor a press selects.
   */
  readonly assist?: AssistMode;
  /** Simulation ticks the run lasted, counted from tick 0. */
  readonly ticks: number;
  /** Ascending by tick, one entry per tick that had intents. */
  readonly inputs: readonly ReplayInput[];
}

/** Thrown by decodeReplay; `path` points at the offending field, e.g. `inputs[3].intents[0].axis`. */
export class ReplayError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ReplayError';
  }
}

export interface DecodedReplay {
  readonly replay: Replay;
  /** True when the replay was recorded on `currentBuild`. */
  readonly buildMatches: boolean;
}

/**
 * Build-mismatch policy (docs/replay.md). decodeReplay only reports `buildMatches`; the caller
 * decides:
 * - leaderboards and anything competitive: refuse a replay whose build does not match;
 * - casual ghosts: allow it and label it "approximate", since other builds may simulate differently.
 */
export const BUILD_MISMATCH_POLICY = {
  leaderboard: 'refuse',
  casualGhost: 'allow-approximate',
} as const;

/** Compact JSON: intents are stored as short tuples, so a ten minute run stays a few kilobytes. */
export function encodeReplay(replay: Replay): string {
  return JSON.stringify({
    v: replay.version,
    b: replay.build,
    l: replay.level,
    s: replay.seed,
    ...(replay.assist && replay.assist !== 'standard' ? { as: replay.assist } : {}),
    n: replay.ticks,
    i: replay.inputs.map((input) => [input.tick, ...input.intents.map(encodeIntent)]),
  });
}

/** Parses and validates a payload. Throws ReplayError with a path on any malformed field. */
export function decodeReplay(text: string, currentBuild: string): DecodedReplay {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ReplayError('$', 'not valid JSON');
  }
  const root = obj(raw, '$');
  const version = root.v;
  if (version !== REPLAY_VERSION) {
    throw new ReplayError('v', `unsupported version ${JSON.stringify(version)}`);
  }
  const build = str(root.b, 'b');
  const level = str(root.l, 'l');
  const seed = int(root.s, 's');
  let assist: AssistMode | null = null;
  if (root.as !== undefined) {
    assist = parseAssistMode(str(root.as, 'as'));
    if (!assist) throw new ReplayError('as', `unknown assist ${JSON.stringify(root.as)}`);
  }
  const ticks = int(root.n, 'n');
  const list = arr(root.i, 'i');
  const inputs: ReplayInput[] = [];
  let previous = -1;
  list.forEach((entry, index) => {
    const path = `inputs[${String(index)}]`;
    const row = arr(entry, path);
    const tick = int(row[0], `${path}.tick`);
    if (tick <= previous) throw new ReplayError(`${path}.tick`, 'ticks must be strictly ascending');
    if (tick >= ticks) throw new ReplayError(`${path}.tick`, 'tick is beyond the replay length');
    previous = tick;
    if (row.length < 2) throw new ReplayError(`${path}.intents`, 'must not be empty');
    const intents = row.slice(1).map((v, k) => decodeIntent(v, `${path}.intents[${String(k)}]`));
    inputs.push({ tick, intents });
  });
  return {
    replay: {
      version: REPLAY_VERSION,
      build,
      level,
      seed,
      ...(assist && assist !== 'standard' ? { assist } : {}),
      ticks,
      inputs,
    },
    buildMatches: build === currentBuild,
  };
}

/** Plays a Replay back as an IntentSource. Ticks without recorded inputs yield no intents. */
export class ReplayIntentSource implements IntentSource {
  private readonly byTick = new Map<number, readonly Intent[]>();

  constructor(readonly replay: Replay) {
    for (const input of replay.inputs) this.byTick.set(input.tick, input.intents);
  }

  poll(tick: number): readonly Intent[] {
    return this.byTick.get(tick) ?? [];
  }
}

/**
 * Wraps any IntentSource and records the non-empty ticks it hands out. The wrapper never alters
 * what the inner source returns.
 */
export class RecordingIntentSource implements IntentSource {
  private readonly inputs: ReplayInput[] = [];

  constructor(private readonly inner: IntentSource) {}

  poll(tick: number): readonly Intent[] {
    const intents = this.inner.poll(tick);
    if (intents.length > 0) this.inputs.push({ tick, intents: intents.map(cloneIntent) });
    return intents;
  }

  /** Finishes the recording; `ticks` is the number of simulation ticks that were run. */
  finish(meta: {
    build: string;
    level: string;
    seed: number;
    ticks: number;
    assist?: AssistMode;
  }): Replay {
    return { version: REPLAY_VERSION, ...meta, inputs: this.inputs.slice() };
  }
}

function cloneIntent(intent: Intent): Intent {
  return intent.type === 'ropeAim'
    ? { type: 'ropeAim', target: vec2(intent.target.x, intent.target.y) }
    : { ...intent };
}

// Short wire codes keep payloads small. `move` and `ropeAim` carry values.
const CODES = {
  jumpPress: 'j',
  jumpRelease: 'J',
  ropePress: 'r',
  ropeRelease: 'R',
  restart: 'x',
  respawn: 'k',
  pause: 'p',
  ghostToggle: 'g',
} as const;
type SimpleType = keyof typeof CODES;
const SIMPLE_BY_CODE = new Map<string, SimpleType>(
  (Object.keys(CODES) as SimpleType[]).map((type) => [CODES[type], type]),
);

function encodeIntent(intent: Intent): unknown {
  switch (intent.type) {
    case 'move':
      return ['m', intent.axis];
    case 'ropeAim':
      return ['a', intent.target.x, intent.target.y];
    default:
      return CODES[intent.type];
  }
}

function decodeIntent(value: unknown, path: string): Intent {
  if (typeof value === 'string') {
    const type = SIMPLE_BY_CODE.get(value);
    if (!type) throw new ReplayError(path, `unknown intent code ${JSON.stringify(value)}`);
    return { type };
  }
  const row = arr(value, path);
  if (row[0] === 'm') {
    if (row.length !== 2) throw new ReplayError(path, 'move takes one value');
    const axis = num(row[1], `${path}.axis`);
    if (axis < -1 || axis > 1) throw new ReplayError(`${path}.axis`, 'must be within [-1, 1]');
    return { type: 'move', axis };
  }
  if (row[0] === 'a') {
    if (row.length !== 3) throw new ReplayError(path, 'ropeAim takes x and y');
    return {
      type: 'ropeAim',
      target: vec2(num(row[1], `${path}.target.x`), num(row[2], `${path}.target.y`)),
    };
  }
  throw new ReplayError(path, 'unknown intent');
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ReplayError(path, 'expected an object');
  }
  return v as Record<string, unknown>;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new ReplayError(path, 'expected an array');
  return v as unknown[];
}
function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new ReplayError(path, 'expected a string');
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ReplayError(path, 'expected a finite number');
  }
  return v;
}
function int(v: unknown, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n) || n < 0) throw new ReplayError(path, 'expected a non-negative integer');
  return n;
}
