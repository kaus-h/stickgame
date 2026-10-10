import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareInboxFiles } from '../../scripts/agents/inbox-prepare.mjs';

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'stickgame-gmr109-inbox-prepare-'));
  try {
    run(root);
  } finally {
    const temp = resolve(tmpdir());
    const target = resolve(root);
    if (
      basename(target).startsWith('stickgame-gmr109-inbox-prepare-') &&
      target.startsWith(`${temp}${sep}`)
    ) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

function addFile(root: string, relativePath: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'fixture\n');
}

describe('inbox preparation', () => {
  it('regenerates the schema before formatting, preserves spaced args, and skips deleted files', () => {
    withTempRoot((root) => {
      const source = 'content/level.schema.json';
      const generated = 'src/content/level-validator.generated.js';
      const spaced = 'src/docs/level notes.md';
      const deleted = 'src/removed file.ts';
      addFile(root, source);
      addFile(root, generated);
      addFile(root, spaced);

      const calls: { command: string; args: string[]; cwd: string }[] = [];
      const run = (command: string, args: string[], cwd: string) => {
        calls.push({ command, args, cwd });
        return {
          ok: true,
          out: command === 'npm' ? 'schema compiled\n' : 'formatted\n',
        };
      };
      const result = prepareInboxFiles(root, [spaced, deleted, source], run);

      expect(calls.map(({ command }) => command)).toEqual(['npm', process.execPath]);
      expect(calls[0]).toMatchObject({
        args: ['run', 'levels:compile-schema'],
        cwd: root,
      });
      expect(calls[1]?.args[0]).toBe(join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs'));
      expect(calls[1]?.args.slice(1)).toEqual([
        '--write',
        '--ignore-unknown',
        '--',
        source,
        generated,
        spaced,
      ]);
      expect(calls[1]?.args).toContain(spaced);
      expect(calls[1]?.args).not.toContain(deleted);
      expect(result).toEqual({
        ok: true,
        stage: 'format',
        out: 'schema compiled\nformatted\n',
        files: [deleted, generated, source, spaced].sort(),
      });
    });
  });

  it('stops at schema failure, including when the touched schema was deleted', () => {
    withTempRoot((root) => {
      const generated = 'src/content/level-validator.generated.js';
      addFile(root, generated); // stale generated output must not be formatted
      const calls: string[] = [];
      const result = prepareInboxFiles(root, ['content/level.schema.json'], (command) => {
        calls.push(command);
        return { ok: false, out: 'ENOENT: missing content/level.schema.json\n' };
      });

      expect(calls).toEqual(['npm']);
      expect(result).toEqual({
        ok: false,
        stage: 'schema',
        out: 'ENOENT: missing content/level.schema.json\n',
        files: ['content/level.schema.json', generated],
      });
    });
  });

  it('returns formatting failures and their output to the caller', () => {
    withTempRoot((root) => {
      const file = 'src/ordinary.ts';
      addFile(root, file);
      const result = prepareInboxFiles(root, [file], () => ({
        ok: false,
        out: 'Prettier failed\n',
      }));

      expect(result).toEqual({
        ok: false,
        stage: 'format',
        out: 'Prettier failed\n',
        files: [file],
      });
    });
  });

  it('runs the real local Prettier CLI through Node for spaced paths in an isolated worktree', () => {
    withTempRoot((root) => {
      const file = 'src/space name.ts';
      const deleted = 'src/deleted.ts';
      const prettierWrapper = join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
      mkdirSync(join(prettierWrapper, '..'), { recursive: true });
      const actualPrettier = fileURLToPath(
        new URL('../../node_modules/prettier/bin/prettier.cjs', import.meta.url),
      );
      writeFileSync(prettierWrapper, `require(${JSON.stringify(actualPrettier)});\n`);
      const source = join(root, file);
      mkdirSync(join(source, '..'), { recursive: true });
      writeFileSync(source, 'export const message=(value:string)=>value.trim()');

      const result = prepareInboxFiles(root, [file, deleted], (command, args, cwd) => {
        const child = spawnSync(command, args, {
          cwd,
          encoding: 'utf8',
          windowsHide: true,
        });
        return {
          ok: child.status === 0,
          out: `${child.stdout}${child.stderr}${child.error?.message ?? ''}`,
        };
      });

      expect(result.ok).toBe(true);
      expect(result.files).toEqual([deleted, file].sort());
      expect(readFileSync(source, 'utf8')).toBe(
        'export const message = (value: string) => value.trim();\n',
      );
    });
  });
});
