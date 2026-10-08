import { describe, expect, it } from 'vitest';
import {
  checkPath,
  detectTask,
  extractErrors,
  parseBundle,
  parseTaskName,
  patchPaths,
} from '../../scripts/agents/inbox-core.mjs';

describe('patch inbox core (docs/agents/workflow.md)', () => {
  it('parses FILE and DELETE blocks, ignoring chatter and stripping code fences', () => {
    const text = [
      'Here is the change you asked for:',
      '===== FILE: src/a.ts =====',
      '```ts',
      'export const a = 1;',
      '```',
      '===== END FILE =====',
      'and a second one',
      '=== FILE: docs/b.md ===',
      '# Title',
      '',
      'Body with ``` inline fence',
      '=== END FILE ===',
      '===== DELETE: src/old.ts =====',
    ].join('\r\n');
    const b = parseBundle(text);
    expect(b.errors).toEqual([]);
    expect(b.writes).toEqual([
      { path: 'src/a.ts', content: 'export const a = 1;\n' },
      { path: 'docs/b.md', content: '# Title\n\nBody with ``` inline fence\n' },
    ]);
    expect(b.deletes).toEqual(['src/old.ts']);
  });

  it('reports an unterminated FILE block instead of writing half a file', () => {
    const b = parseBundle(
      '===== FILE: src/a.ts =====\nconst a = 1;\n===== FILE: src/b.ts =====\nx\n===== END FILE =====',
    );
    expect(b.errors).toEqual(['FILE block for src/a.ts has no END FILE line']);
    expect(b.writes.map((w) => w.path)).toEqual(['src/b.ts']);
  });

  it('refuses paths outside the repo or into git, node_modules and agent state', () => {
    for (const bad of [
      '/etc/passwd',
      'C:/x.ts',
      '../x.ts',
      'src/../x.ts',
      '.git/config',
      'node_modules/a/index.js',
      '.claude/settings.json',
      '.env',
    ])
      expect(checkPath(bad).ok, bad).toBe(false);
    expect(checkPath('src/sim/Simulation.ts')).toEqual({ ok: true, sensitive: false });
    for (const sensitive of [
      '.github/workflows/ci.yml',
      'package.json',
      'AGENTS.md',
      'src/tools/device-lab/golden.ts',
    ])
      expect(checkPath(sensitive)).toEqual({ ok: true, sensitive: true });
  });

  it('lists every path a unified diff touches', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-x',
      '+y',
      'diff --git a/new.md b/new.md',
      '--- /dev/null',
      '+++ b/new.md',
    ].join('\n');
    expect(patchPaths(diff).sort()).toEqual(['new.md', 'src/a.ts']);
  });

  it('keeps only error lines with context from a check log, capped', () => {
    const log = [
      'ok 1',
      'ok 2',
      'ok 3',
      'ok 4',
      'src/a.ts(3,1): error TS2322: bad',
      'ok 6',
      ...Array<string>(300).fill('noise'),
    ].join('\n');
    const out = extractErrors(log);
    expect(out).toContain('error TS2322');
    expect(out.split('\n').length).toBeLessThan(10);
    expect(
      extractErrors(Array<string>(500).fill('Error: x').join('\n'), 20).split('\n'),
    ).toHaveLength(21);
  });

  it('derives the Linear issue and a branch slug from the task name', () => {
    expect(parseTaskName('GMR-123-Add spikes.bundle.txt')).toEqual({
      id: 'GMR-123-Add spikes',
      issue: 'GMR-123',
      slug: 'gmr-123-add-spikes',
    });
    expect(parseTaskName('misc.patch').issue).toBeNull();
  });

  it('recognises a renamed download by its TASK header, and only then', () => {
    const bundle = [
      '===== TASK: GMR-12-spikes =====',
      '===== FILE: a.ts =====',
      'x',
      '===== END FILE =====',
    ].join('\n');
    expect(detectTask(bundle)).toEqual({ name: 'GMR-12-spikes', ext: '.bundle.txt' });
    expect(
      detectTask(['TASK: GMR-12-fix', 'diff --git a/a.ts b/a.ts', '--- a/a.ts'].join('\n')),
    ).toEqual({
      name: 'GMR-12-fix',
      ext: '.patch',
    });
    expect(detectTask('some log file\nTASK: x')).toBeNull();
    expect(detectTask('===== FILE: a.ts =====')).toBeNull();
    expect(detectTask('TASK: ../../evil\n===== FILE: a.ts =====')).toBeNull();
    expect(parseBundle(bundle).writes).toEqual([{ path: 'a.ts', content: 'x\n' }]);
  });
});
