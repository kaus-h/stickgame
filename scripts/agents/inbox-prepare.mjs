// Ordered install preparation for scripts/agents/patch-inbox.mjs.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { preparationPaths } from './inbox-core.mjs';
import { assertInboxPath } from './inbox-git.mjs';

/**
 * Regenerate generated level validation when its schema source changed, then format present files.
 * @param {string} wt
 * @param {string[]} files
 * @param {(command: string, args: string[], cwd: string) => { ok: boolean, out: string }} run
 * @returns {{ ok: boolean, stage: 'schema' | 'format', out: string, files: string[] }}
 */
export function prepareInboxFiles(wt, files, run) {
  const preparation = preparationPaths(files);
  const allFiles = [...new Set([...files, ...preparation.generatedPaths])].sort();
  allFiles.forEach((path) => assertInboxPath(wt, path));
  let out = '';

  if (preparation.regenerateSchema) {
    const schema = run('npm', ['run', 'levels:compile-schema'], wt);
    out += schema.out;
    if (!schema.ok) return { ok: false, stage: 'schema', out, files: allFiles };
  }

  allFiles.forEach((path) => assertInboxPath(wt, path));
  const present = allFiles.filter((path) => existsSync(join(wt, path)));
  if (present.length > 0) {
    const prettier = join(wt, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
    const format = run(
      process.execPath,
      [prettier, '--write', '--ignore-unknown', '--', ...present],
      wt,
    );
    out += format.out;
    if (!format.ok) return { ok: false, stage: 'format', out, files: allFiles };
  }

  return { ok: true, stage: 'format', out, files: allFiles };
}
