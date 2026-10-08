#!/usr/bin/env node
// Route solver CLI (GMR-101). Bundles src/tools/route-solver (TypeScript, no DOM) with rolldown
// into node_modules/.cache, runs it headless against content/levels and writes
// content/solutions/<levelId>.json (report + full-level replay).
//
//   npm run levels:solve                      solve every level
//   npm run levels:solve -- lab-authoring     solve one level (ids or several)
//   npm run levels:solve -- lab-x --chamber c2 [--from-checkpoint]   one chamber (no fixture write
//                                             with --from-checkpoint: its start is not replayable)
//   npm run levels:solve -- --budget 2000000  simulated-tick budget per chamber
//   npm run levels:solve -- --verify          replay committed fixtures only (no search)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import { build } from 'rolldown';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const levelsDir = join(root, 'content', 'levels');
const solutionsDir = join(root, 'content', 'solutions');
const outFile = join(root, 'node_modules', '.cache', 'route-solver', 'solver.mjs');

function parseArgs(argv) {
  const args = { ids: [], verify: false, fromCheckpoint: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify') args.verify = true;
    else if (a === '--from-checkpoint') args.fromCheckpoint = true;
    else if (a === '--chamber') args.chamber = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else args.ids.push(a);
  }
  return args;
}

async function loadSolver() {
  mkdirSync(dirname(outFile), { recursive: true });
  await build({
    input: join(root, 'src', 'tools', 'route-solver', 'index.ts'),
    cwd: root,
    platform: 'node',
    logLevel: 'warn',
    output: { file: outFile, format: 'esm' },
  });
  return import(`${pathToFileURL(outFile).href}?t=${String(Date.now())}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function writeFormatted(path, data) {
  const config = (await prettier.resolveConfig(path)) ?? {};
  const text = await prettier.format(JSON.stringify(data), { ...config, filepath: path });
  writeFileSync(path, text);
}

function summarize(file, ms) {
  const tight = file.chambers
    .map((c) => (c.tightestWindow ? `${c.id}:${String(c.tightestWindow.size)}t` : `${c.id}:-`))
    .join(' ');
  const ticks = file.totalTicks === null ? '-' : `${String(file.totalTicks)}t`;
  return `${file.level.padEnd(16)} ${(file.solved ? 'solved' : 'UNSOLVED').padEnd(9)} route ${ticks.padEnd(6)} tightest ${tight.padEnd(14)} ${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const solver = await loadSolver();
  const tuning = readJson(join(root, 'content', 'tuning', 'runtime.json'));
  const levels = readdirSync(levelsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(levelsDir, f)))
    .filter((l) => args.ids.length === 0 || args.ids.includes(l.id));
  if (args.ids.length > 0 && levels.length !== args.ids.length) {
    throw new Error(`unknown level id in: ${args.ids.join(', ')}`);
  }
  mkdirSync(solutionsDir, { recursive: true });
  let failures = 0;
  for (const json of levels) {
    const out = join(solutionsDir, `${json.id}.json`);
    if (args.verify) {
      let file;
      try {
        file = readJson(out);
      } catch {
        console.log(`${json.id.padEnd(16)} no fixture`);
        continue;
      }
      if (!file.solved) {
        console.log(`${json.id.padEnd(16)} unsolved (recorded, nothing to replay)`);
        continue;
      }
      const v = solver.verifySolution(
        solver.parseLevel(json),
        solver.parseRuntimeTuning(tuning),
        file,
      );
      if (!v.ok) failures++;
      console.log(
        `${json.id.padEnd(16)} ${v.ok ? 'ok' : 'FAILED'} goals ${String(v.reached)}/${String(v.goals)} deaths ${String(v.deaths)}`,
      );
      continue;
    }
    const options = {};
    if (args.chamber !== undefined) options.chamber = args.chamber;
    if (args.fromCheckpoint) options.fromCheckpoint = true;
    if (args.budget !== undefined)
      options.search = { ...solver.DEFAULT_SEARCH, maxSimTicks: args.budget };
    const t0 = Date.now();
    const file = solver.solveLevelJson(json, tuning, options);
    const ms = Date.now() - t0;
    if (!file.solved) failures++;
    console.log(summarize(file, ms));
    for (const note of file.notes) console.log(`  note: ${note}`);
    if (file.start === 'spawn' && args.chamber === undefined) await writeFormatted(out, file);
  }
  if (failures > 0) process.exitCode = 1;
}

await main();
