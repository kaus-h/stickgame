import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/** Every file under `dir`, sorted, so the hash does not depend on directory iteration order. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/**
 * `<short SHA>-<content hash of content/ and src/>` (GMR-53). The SHA names the commit; the content
 * hash also changes for a dirty working tree, so two different builds never share an id.
 * Line endings are normalised so Windows and Linux hash identically.
 */
function computeBuildHash(): string {
  let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      sha = 'nogit';
    }
  }
  const hash = createHash('sha256');
  for (const dir of ['content', 'src']) {
    for (const file of listFiles(dir)) {
      hash.update(file.replaceAll('\\', '/'));
      hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
    }
  }
  return `${sha}-${hash.digest('hex').slice(0, 8)}`;
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(computeBuildHash()),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Phaser alone is ~1.4 MB minified; the download budget is enforced by scripts/bundle-report.mjs
    // against budgets.json (GMR-53), so this only silences Vite's generic warning.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
