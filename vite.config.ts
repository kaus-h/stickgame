import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { ensurePhaserBuild, phaserBuildFile } from './scripts/build-phaser.mjs';

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

/**
 * Slim Phaser (GMR-99): `phaser` resolves to vendor/.build/phaser.mjs, built from
 * vendor/phaser-custom.js by scripts/build-phaser.mjs (only the engine systems the game uses).
 * The alias applies to the dev server, builds and e2e runs alike, so tests exercise the shipped
 * engine. TypeScript keeps using the full `phaser` package types.
 */
function slimPhaser(): Plugin {
  return {
    name: 'slim-phaser',
    async config() {
      await ensurePhaserBuild();
      return { resolve: { alias: [{ find: /^phaser$/, replacement: phaserBuildFile }] } };
    },
  };
}

export default defineConfig({
  plugins: [slimPhaser()],
  define: {
    __BUILD_HASH__: JSON.stringify(computeBuildHash()),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The slim Phaser build (GMR-99) is still most of the main chunk; the download budget is
    // enforced by scripts/bundle-report.mjs against budgets.json (GMR-53), so this only silences
    // Vite's generic warning.
    chunkSizeWarningLimit: 1600,
    // The touch lab (GMR-27) ships with every build so preview links and the Capacitor shell can
    // open it on a phone; it is a separate page and never loads with the game.
    rollupOptions: {
      input: { main: 'index.html', 'touch-lab': 'touch-lab.html' },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
