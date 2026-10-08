#!/usr/bin/env node
// Bundle-size report against budgets.json (GMR-53). Run after `npm run build`.
// Prints a markdown table; exits 1 when over budget. In CI the table also goes to the job summary.
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'dist';
const budgets = JSON.parse(readFileSync(new URL('../budgets.json', import.meta.url), 'utf8'));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const files = walk(dist)
  .filter((f) => !f.endsWith('.map'))
  .map((f) => ({ path: relative(dist, f).replaceAll('\\', '/'), bytes: statSync(f).size }));

// "Initial" JS = the module scripts and modulepreloads that index.html loads up front.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
);
const initialJs = [...initial].map((p) => ({
  path: p,
  gzip: gzipSync(readFileSync(join(dist, p)), { level: 9 }).length,
}));
const initialGzip = initialJs.reduce((n, f) => n + f.gzip, 0);
const total = files.reduce((n, f) => n + f.bytes, 0);

const kb = (b) => (b / 1024).toFixed(1);
const rows = [
  ['Initial JS (gzip)', initialGzip, budgets.initialJsGzipKB * 1024],
  ['Total dist (excl. maps)', total, budgets.totalKB * 1024],
];
const lines = [
  '### Bundle size',
  '',
  '| Metric | Size | Budget | Status |',
  '| --- | ---: | ---: | :---: |',
  ...rows.map(
    ([name, size, limit]) =>
      `| ${name} | ${kb(size)} KB | ${kb(limit)} KB | ${size <= limit ? 'ok' : 'OVER'} |`,
  ),
  '',
  '| Initial JS file | gzip |',
  '| --- | ---: |',
  ...initialJs.map((f) => `| ${f.path} | ${kb(f.gzip)} KB |`),
  '',
];
const out = lines.join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);

if (initial.size === 0) {
  console.error('No initial JS found in index.html: report cannot be trusted.');
  process.exit(1);
}
if (rows.some(([, size, limit]) => size > limit)) {
  console.error('Bundle is over budget.');
  process.exit(1);
}
