import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import chapterJson from '../../content/chapters/chapter-1.json';
import strings from '../../content/strings/en.json';
import {
  ChapterError,
  continueLevel,
  formatTicks,
  isUnlocked,
  nextLevel,
  parseChapter,
  playOrder,
  t,
} from '../../src/app/web/ui/flow';
import type { LevelRecord } from '../../src/platform';

const known = new Set(['lab-01', 'lab-exit-wide', 'lab-moving', 'lab-collision']);
const chapter = parseChapter(chapterJson, known);
const cleared: LevelRecord = {
  cleared: true,
  bestTicks: 600,
  fewestDeaths: 0,
  totalDeaths: 0,
  medals: [],
};

describe('game flow model (GMR-47)', () => {
  it('parses the chapter manifest and lists Section 1 in play order', () => {
    expect(playOrder(chapter).map((l) => l.label)).toEqual(['1-1', '1-2', '1-3']);
  });

  it('rejects unknown or duplicate levels with a path', () => {
    expect(() => parseChapter(chapterJson, new Set(['lab-01']))).toThrow(ChapterError);
    const dup = structuredClone(chapterJson);
    dup.sections[0]?.levels.push({ id: 'lab-01', label: 'x', placeholder: true });
    expect(() => parseChapter(dup, known)).toThrow('listed twice');
  });

  it('unlocks the first level, then each level after a clear; cleared levels stay open', () => {
    expect(isUnlocked(chapter, 'lab-01', {})).toBe(true);
    expect(isUnlocked(chapter, 'lab-exit-wide', {})).toBe(false);
    expect(isUnlocked(chapter, 'lab-exit-wide', { 'lab-01': cleared })).toBe(true);
    expect(isUnlocked(chapter, 'lab-moving', { 'lab-01': cleared })).toBe(false);
    expect(isUnlocked(chapter, 'not-in-chapter', {})).toBe(false);
  });

  it('continues at the first unlocked, uncleared level', () => {
    expect(continueLevel(chapter, {}).id).toBe('lab-01');
    expect(continueLevel(chapter, { 'lab-01': cleared }).id).toBe('lab-exit-wide');
    const all = { 'lab-01': cleared, 'lab-exit-wide': cleared, 'lab-moving': cleared };
    expect(continueLevel(chapter, all).id).toBe('lab-moving');
  });

  it('knows the next level and the end of the chapter', () => {
    expect(nextLevel(chapter, 'lab-01')?.id).toBe('lab-exit-wide');
    expect(nextLevel(chapter, 'lab-moving')).toBeNull();
  });

  it('formats times and fills externalized strings', () => {
    expect(formatTicks(3723)).toBe('01:02.05');
    expect(t(strings, 'results.heading', { level: '1-2' })).toBe('1-2 cleared');
    expect(t(strings, 'missing.key')).toBe('missing.key');
  });

  it('every string key used by the UI exists', () => {
    const src = readFileSync('src/app/web/ui/GameFlowUi.ts', 'utf8');
    const used = [...src.matchAll(/this\.s\('([\w.-]+)'/g)].map((m) => m[1] as string);
    expect(used.length).toBeGreaterThan(20);
    for (const key of used) expect(strings, key).toHaveProperty([key]);
  });
});
