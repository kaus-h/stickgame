#!/usr/bin/env node
// Level design review (GMR-72): draw a level's collision, hazards, anchor paths, checkpoints and the
// committed solver route as an SVG. Purely a dev tool; it never changes level data.
//
//   npm run levels:plot -- 2-1                 writes node_modules/.cache/plots/2-1.svg
//   npm run levels:plot -- 2-1 --x 50 90       crop to x 50..90 m
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'node_modules', '.cache', 'plots');
const bundle = join(root, 'node_modules', '.cache', 'route-solver', 'plot.mjs');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const argv = process.argv.slice(2);
const id = argv[0];
if (!id) throw new Error('usage: levels:plot -- <levelId> [--x min max]');
const xi = argv.indexOf('--x');
const crop = xi >= 0 ? [Number(argv[xi + 1]), Number(argv[xi + 2])] : null;

mkdirSync(dirname(bundle), { recursive: true });
await build({
  input: join(root, 'src', 'tools', 'route-solver', 'index.ts'),
  cwd: root,
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});
const solver = await import(`${pathToFileURL(bundle).href}?t=${String(Date.now())}`);
const raw = readJson(join(root, 'content', 'levels', `${id}.json`));
const level = solver.parseLevel(raw);
const tuning = solver.parseRuntimeTuning(readJson(join(root, 'content', 'tuning', 'runtime.json')));
const solution = readJson(join(root, 'content', 'solutions', `${id}.json`));
const trace = solution.replay ? solver.traceSolution(level, tuning, solution.replay) : [];

const S = 24; // px per metre
const b = level.bounds;
const x0 = crop ? crop[0] : b.minX;
const x1 = crop ? crop[1] : b.maxX;
const W = (x1 - x0) * S;
const H = (b.maxY - b.minY) * S;
const X = (x) => ((x - x0) * S).toFixed(1);
const Y = (y) => ((y - b.minY) * S).toFixed(1);
const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="#f3efe6"/>`);
for (let gx = Math.ceil(x0); gx <= x1; gx++)
  parts.push(
    `<line x1="${X(gx)}" y1="0" x2="${X(gx)}" y2="${H}" stroke="${gx % 10 === 0 ? '#9ab' : '#dde'}" stroke-width="${gx % 10 === 0 ? 1 : 0.5}"/>`,
  );
for (let gx = Math.ceil(x0 / 10) * 10; gx <= x1; gx += 10)
  parts.push(`<text x="${X(gx) - -2}" y="12" font-size="11" fill="#678">${gx}</text>`);
for (const s of raw.solids) {
  const r = s.rect;
  const hazard = s.kind === 'hazard';
  parts.push(
    `<rect x="${X(r.x)}" y="${Y(r.y)}" width="${(r.w * S).toFixed(1)}" height="${(r.h * S).toFixed(1)}" fill="${hazard ? '#e04a3f' : '#6b6b70'}" fill-opacity="${hazard ? 0.85 : 0.55}"><title>${s.id}</title></rect>`,
  );
}
for (const a of level.anchors) {
  if (a.path)
    parts.push(
      `<line x1="${X(a.position.x)}" y1="${Y(a.position.y)}" x2="${X(a.path.to.x)}" y2="${Y(a.path.to.y)}" stroke="#333" stroke-dasharray="3 3"/>`,
    );
  parts.push(
    `<circle cx="${X(a.position.x)}" cy="${Y(a.position.y)}" r="${a.radius * S}" fill="none" stroke="#111" stroke-width="2"/><text x="${X(a.position.x)}" y="${Y(a.position.y) - a.radius * S - 3}" font-size="11">${a.id}</text>`,
  );
}
for (const cp of level.checkpoints ?? [])
  parts.push(
    `<path d="M${X(cp.position.x)} ${Y(cp.position.y + 0.35)} v-30 l12 6 l-12 6" fill="none" stroke="#2a7" stroke-width="2"/>`,
  );
if (level.exit)
  parts.push(
    `<rect x="${X(level.exit.min.x)}" y="${Y(level.exit.min.y)}" width="${((level.exit.max.x - level.exit.min.x) * S).toFixed(1)}" height="${((level.exit.max.y - level.exit.min.y) * S).toFixed(1)}" fill="#2a7" fill-opacity="0.3"/>`,
  );
let path = '';
let lastRope = null;
for (const [i, p] of trace.entries()) {
  path += `${i === 0 ? 'M' : 'L'}${X(p.at.x)} ${Y(p.at.y)} `;
  if (p.rope && i % 6 === 0)
    parts.push(
      `<line x1="${X(p.at.x)}" y1="${Y(p.at.y)}" x2="${X(p.rope.x)}" y2="${Y(p.rope.y)}" stroke="#36c" stroke-opacity="0.35" stroke-width="1"/>`,
    );
  if (p.rope && !lastRope)
    parts.push(`<circle cx="${X(p.at.x)}" cy="${Y(p.at.y)}" r="4" fill="#36c"/>`);
  if (!p.rope && lastRope)
    parts.push(`<circle cx="${X(p.at.x)}" cy="${Y(p.at.y)}" r="4" fill="#f90"/>`);
  if (i % 60 === 0)
    parts.push(
      `<text x="${X(p.at.x) - -4}" y="${Y(p.at.y) - 6}" font-size="10" fill="#36c">${(p.tick / 60).toFixed(0)}s</text>`,
    );
  lastRope = p.rope;
}
parts.push(`<path d="${path}" fill="none" stroke="#1a5fd0" stroke-width="2"/>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${id}${crop ? `-${crop[0]}-${crop[1]}` : ''}.svg`);
writeFileSync(file, svg);
console.log(file);
