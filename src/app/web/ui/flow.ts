import type { LevelRecord } from '../../../platform';

/** Chapter manifest (content/chapters/*.json). */
export interface ChapterLevel {
  readonly id: string;
  readonly label: string;
  /** True while the entry points at a lab standing in for an unauthored level. */
  readonly placeholder: boolean;
}

export interface Chapter {
  readonly id: string;
  readonly sections: readonly { readonly id: string; readonly levels: readonly ChapterLevel[] }[];
}

export class ChapterError extends Error {}

export function parseChapter(json: unknown, knownLevels: ReadonlySet<string>): Chapter {
  const fail = (msg: string): never => {
    throw new ChapterError(msg);
  };
  if (typeof json !== 'object' || json === null) return fail('chapter must be an object');
  const j = json as Record<string, unknown>;
  if (j.version !== 1) fail('chapter.version must be 1');
  if (typeof j.id !== 'string') fail('chapter.id must be a string');
  if (!Array.isArray(j.sections) || j.sections.length === 0)
    fail('chapter.sections must be a list');
  const seen = new Set<string>();
  const sections = (j.sections as unknown[]).map((raw, si) => {
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !Array.isArray(s.levels))
      fail(`sections[${String(si)}] invalid`);
    const levels = (s.levels as unknown[]).map((lr, li) => {
      const l = lr as Record<string, unknown>;
      const path = `sections[${String(si)}].levels[${String(li)}]`;
      if (typeof l.id !== 'string' || typeof l.label !== 'string')
        fail(`${path} needs id and label`);
      const id = l.id as string;
      if (!knownLevels.has(id)) fail(`${path}: unknown level "${id}"`);
      if (seen.has(id)) fail(`${path}: level "${id}" listed twice`);
      seen.add(id);
      return { id, label: l.label as string, placeholder: l.placeholder === true };
    });
    return { id: s.id as string, levels };
  });
  return { id: j.id as string, sections };
}

/** Every level of the chapter in play order. */
export function playOrder(chapter: Chapter): ChapterLevel[] {
  return chapter.sections.flatMap((s) => s.levels);
}

/**
 * Progression (doc 14, K3 CURRENT DEFAULT): the first level is open, each clear unlocks the next,
 * and any cleared level stays replayable.
 */
export function isUnlocked(
  chapter: Chapter,
  levelId: string,
  records: Readonly<Record<string, LevelRecord>>,
): boolean {
  const order = playOrder(chapter);
  const i = order.findIndex((l) => l.id === levelId);
  if (i < 0) return false;
  if (i === 0) return true;
  return records[(order[i - 1] as ChapterLevel).id]?.cleared === true;
}

/** The next level after `levelId` in play order, or null at the end of the chapter. */
export function nextLevel(chapter: Chapter, levelId: string): ChapterLevel | null {
  const order = playOrder(chapter);
  const i = order.findIndex((l) => l.id === levelId);
  return i >= 0 && i + 1 < order.length ? (order[i + 1] as ChapterLevel) : null;
}

/** Where "Play" goes: the first unlocked level not yet cleared, else the last level. */
export function continueLevel(
  chapter: Chapter,
  records: Readonly<Record<string, LevelRecord>>,
): ChapterLevel {
  const order = playOrder(chapter);
  return (
    order.find((l) => isUnlocked(chapter, l.id, records) && records[l.id]?.cleared !== true) ??
    (order[order.length - 1] as ChapterLevel)
  );
}

/** mm:ss.cc from simulation ticks (60 Hz). */
export function formatTicks(ticks: number): string {
  const total = ticks / 60;
  const mm = Math.floor(total / 60);
  const ss = total - mm * 60;
  return `${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`;
}

export type Strings = Readonly<Record<string, string>>;

/** Look up an externalized string and fill {placeholders}; a missing key shows the key itself. */
export function t(
  strings: Strings,
  key: string,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  const raw = strings[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
