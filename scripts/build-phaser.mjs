#!/usr/bin/env node
// Slim Phaser build (GMR-99). Bundles vendor/phaser-custom.js (an ESM entry over Phaser's CommonJS
// src/) into one ESM file, vendor/.build/phaser.mjs, which vite.config.ts aliases to `phaser`.
// The output is generated (git-ignored): vite.config.ts calls ensurePhaserBuild() on every dev
// server start, build and e2e run, and it rebuilds only when the inputs below change.
//
// Phaser's own builds (node_modules/phaser/config/webpack*.js) set compile-time feature flags with
// webpack's DefinePlugin on `typeof FLAG`. The same flags are replaced here. Every `typeof FLAG`
// left undefined would evaluate to the truthy string "undefined", so all of them are set.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'vendor', 'phaser-custom.js');
const phaserSrc = join(root, 'node_modules', 'phaser', 'src');
export const phaserBuildFile = join(root, 'vendor', '.build', 'phaser.mjs');
const stampFile = join(root, 'vendor', '.build', 'stamp.txt');

/** Compile-time flags, as in Phaser's webpack configs plus the plugin flags in its source. */
export const PHASER_FLAGS = {
  CANVAS_RENDERER: true, // `?renderer=canvas` and the AUTO fallback
  WEBGL_RENDERER: true, // AUTO prefers WebGL
  WEBGL_DEBUG: false, // would bundle the Spector.js debugger
  EXPERIMENTAL: false,
  PLUGIN_3D: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  FEATURE_SOUND: false, // audio is our own Web Audio code (src/audio)
};

const flagPattern = new RegExp(`typeof\\s+(${Object.keys(PHASER_FLAGS).join('|')})\\b`, 'g');

function inputsHash() {
  const phaserPkg = JSON.parse(
    readFileSync(join(root, 'node_modules', 'phaser', 'package.json'), 'utf8'),
  );
  const hash = createHash('sha256');
  hash.update(phaserPkg.version);
  hash.update(readFileSync(entry, 'utf8').replaceAll('\r\n', '\n'));
  hash.update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  return hash.digest('hex');
}

async function buildPhaser() {
  await build({
    input: entry,
    cwd: root,
    logLevel: 'warn',
    resolve: { alias: { 'phaser-src': phaserSrc } },
    platform: 'browser',
    treeshake: true,
    plugins: [
      {
        name: 'phaser-flags',
        transform(code, id) {
          if (!id.replaceAll('\\', '/').includes('/node_modules/phaser/src/')) return null;
          if (!code.includes('typeof')) return null;
          const out = code.replace(flagPattern, (_, flag) => JSON.stringify(PHASER_FLAGS[flag]));
          return out === code ? null : { code: out, map: null };
        },
      },
    ],
    output: {
      file: phaserBuildFile,
      format: 'esm',
      sourcemap: false,
      minify: false,
    },
  });
}

/** Rebuild vendor/.build/phaser.mjs when the entry, this script or the Phaser version changed. */
export async function ensurePhaserBuild({ force = false } = {}) {
  const stamp = inputsHash();
  const fresh =
    existsSync(phaserBuildFile) &&
    existsSync(stampFile) &&
    readFileSync(stampFile, 'utf8') === stamp;
  if (fresh && !force) return false;
  mkdirSync(dirname(phaserBuildFile), { recursive: true });
  await buildPhaser();
  const built = readFileSync(phaserBuildFile, 'utf8');
  const leftover = built.match(flagPattern);
  if (leftover)
    throw new Error(`Slim Phaser build left feature flags unreplaced: ${leftover.join(', ')}`);
  writeFileSync(stampFile, stamp);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  await ensurePhaserBuild({ force: true });
  console.log(`Built ${phaserBuildFile} in ${Date.now() - t} ms`);
}
