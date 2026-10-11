import { describe, expect, it } from 'vitest';
import {
  checkPath,
  detectTask,
  extractErrors,
  parseBundle,
  parseTaskName,
  patchPaths,
  preparationPaths,
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
      '.CLAUDE\\settings.json',
      'src\\.Git\\config',
      'src\\.ENV.local',
      'src\\Node_Modules\\module.js',
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

  it('decodes quoted Git paths and preserves unquoted paths with spaces', () => {
    const diff = [
      'diff --git a/src/space name.ts b/src/space name.ts',
      '--- a/src/space name.ts',
      '+++ b/src/space name.ts',
      String.raw`diff --git "a/src/old file.ts" "b/src/new file.ts"`,
      String.raw`--- "a/src/old file.ts"`,
      String.raw`+++ "b/src/new file.ts"`,
      String.raw`diff --git "a/src/deleted file.ts" "b/src/deleted file.ts"`,
      String.raw`--- "a/src/deleted file.ts"`,
      '+++ /dev/null',
      String.raw`diff --git "a/src/created file.ts" "b/src/created file.ts"`,
      '--- /dev/null',
      String.raw`+++ "b/src/created file.ts"`,
      String.raw`diff --git "a/src/mixed-old.ts" b/src/mixed new.ts`,
      String.raw`--- "a/src/mixed-old.ts"`,
      '+++ b/src/mixed new.ts',
      String.raw`diff --git "a/src/quote\"name.ts" "b/src/quote\"name.ts"`,
      String.raw`--- "a/src/quote\"name.ts"`,
      String.raw`+++ "b/src/quote\"name.ts"`,
      String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"`,
      String.raw`--- "a/src/caf\303\251.ts"`,
      String.raw`+++ "b/src/caf\303\251.ts"`,
      String.raw`diff --git "a/.CLAUDE/settings.json" "b/.CLAUDE/settings.json"`,
      String.raw`--- "a/.CLAUDE/settings.json"`,
      String.raw`+++ "b/.CLAUDE/settings.json"`,
    ].join('\n');
    const paths = patchPaths(diff).sort();
    expect(paths).toEqual(
      [
        '.CLAUDE/settings.json',
        'src/caf\u00e9.ts',
        'src/created file.ts',
        'src/deleted file.ts',
        'src/mixed new.ts',
        'src/mixed-old.ts',
        'src/new file.ts',
        'src/old file.ts',
        'src/quote"name.ts',
        'src/space name.ts',
      ].sort(),
    );
    expect(checkPath('.CLAUDE/settings.json').ok).toBe(false);
  });

  it('derives generated schema preparation paths only when the source schema is touched', () => {
    expect(preparationPaths(['src/content/level.schema.json'])).toEqual({
      regenerateSchema: false,
      generatedPaths: [],
    });
    expect(preparationPaths(['content\\level.schema.json'])).toEqual({
      regenerateSchema: true,
      generatedPaths: ['src/content/level-validator.generated.js'],
    });
    // A deleted schema is still marked for regeneration; the caller gets the compiler's explicit
    // missing-input failure instead of formatting or checking a stale generated validator.
    expect(preparationPaths(['content/level.schema.json'])).toEqual({
      regenerateSchema: true,
      generatedPaths: ['src/content/level-validator.generated.js'],
    });
  });

  it('extracts ANSI-stripped failure context and caps the selected lines', () => {
    const log = [
      'ok 1',
      'ok 2',
      'ok 3',
      'ok 4',
      '\u001b[31msrc/a.ts(3,1): error TS2322: bad\u001b[0m',
      'ok 6',
      ...Array<string>(300).fill('noise'),
      '',
      '   ',
    ].join('\n');
    const out = extractErrors(log);
    expect(out).toContain('error TS2322');
    expect(out).not.toContain('\u001b[');
    expect(out).not.toMatch(/\n\s*$/);
    expect(out.split('\n').length).toBeLessThan(10);
    expect(
      extractErrors(Array<string>(500).fill('Error: x').join('\n'), 20).split('\n'),
    ).toHaveLength(21);
  });

  it('falls back to the last 30 nonempty log lines with internal blank context', () => {
    const log = [
      ...Array.from({ length: 40 }, (_, index) => `output ${String(index + 1)}`),
      '',
      '   ',
    ].join('\n');
    const out = extractErrors(log);
    const nonempty = out.split('\n').filter((line) => line.trim());
    expect(nonempty).toHaveLength(30);
    expect(nonempty[0]).toBe('output 11');
    expect(nonempty[29]).toBe('output 40');
    expect(out).not.toMatch(/\n\s*$/);

    const withContext = extractErrors(
      [...Array.from({ length: 5 }, (_, i) => `noise ${String(i)}`), '', 'last useful line'].join(
        '\n',
      ),
    );
    expect(withContext).toContain('noise 4\n\nlast useful line');
  });

  it('reports a whitespace-only check log explicitly', () => {
    expect(extractErrors(' \n\t\r\n')).toBe('(check log contained only whitespace)');
    expect(extractErrors('')).toBe('(check produced no output)');
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
