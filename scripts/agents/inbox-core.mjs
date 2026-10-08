// Pure helpers for the patch inbox (scripts/agents/patch-inbox.mjs). No I/O here, so unit tests
// cover them (tests/unit/inbox-core.test.ts). See docs/agents/workflow.md.

/**
 * Parse a text bundle written by a chat model. Blocks:
 *
 *   ===== FILE: path/to/file.ts =====
 *   ...full file content...
 *   ===== END FILE =====
 *
 *   ===== DELETE: path/to/old.ts =====
 *
 * A Markdown code fence wrapped around a file's content (```ts ... ```) is removed, since chat
 * models add them. Text outside blocks is ignored (models like to explain themselves).
 * @param {string} text
 * @returns {{ writes: { path: string, content: string }[], deletes: string[], errors: string[] }}
 */
export function parseBundle(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const writes = [];
  const deletes = [];
  const errors = [];
  const open = /^={3,}\s*FILE:\s*(.+?)\s*={3,}\s*$/;
  const end = /^={3,}\s*END FILE\s*={3,}\s*$/;
  const del = /^={3,}\s*DELETE:\s*(.+?)\s*={3,}\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const d = del.exec(line);
    if (d) {
      deletes.push(cleanPath(d[1] ?? ''));
      continue;
    }
    const o = open.exec(line);
    if (!o) continue;
    const path = cleanPath(o[1] ?? '');
    const body = [];
    let closed = false;
    for (i++; i < lines.length; i++) {
      const l = lines[i] ?? '';
      if (end.test(l)) {
        closed = true;
        break;
      }
      if (open.test(l) || del.test(l)) {
        i--;
        break;
      }
      body.push(l);
    }
    if (!closed) {
      errors.push(`FILE block for ${path} has no END FILE line`);
      continue;
    }
    writes.push({ path, content: stripFence(body).join('\n') + '\n' });
  }
  return { writes, deletes, errors };
}

function cleanPath(p) {
  return p
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/\\/g, '/');
}

function stripFence(body) {
  let start = 0;
  let stop = body.length;
  while (start < stop && (body[start] ?? '').trim() === '') start++;
  while (stop > start && (body[stop - 1] ?? '').trim() === '') stop--;
  const first = body[start] ?? '';
  const last = body[stop - 1] ?? '';
  if (stop - start >= 2 && /^```[\w.+-]*\s*$/.test(first) && /^```\s*$/.test(last)) {
    return body.slice(start + 1, stop - 1);
  }
  return body.slice(start, stop);
}

/** Paths an inbox task may never touch. */
const FORBIDDEN = [/^\.git(\/|$)/, /(^|\/)node_modules(\/|$)/, /^\.claude(\/|$)/, /^\.env/];
/** Paths that need Opus's explicit attention in review (flagged in the PR body). */
const SENSITIVE = [
  /^\.github\//,
  /^package(-lock)?\.json$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^scripts\/agents\//,
  /^src\/tools\/device-lab\/golden\.ts$/,
  /^eslint\.config\.js$/,
  /^\.dependency-cruiser\.cjs$/,
];

/**
 * Check one repo-relative path from a model's output.
 * @param {string} p
 * @returns {{ ok: boolean, sensitive: boolean, reason?: string }}
 */
export function checkPath(p) {
  if (!p) return { ok: false, sensitive: false, reason: 'empty path' };
  if (/^[a-zA-Z]:/.test(p) || p.startsWith('/'))
    return { ok: false, sensitive: false, reason: `absolute path ${p}` };
  const parts = p.split('/');
  if (parts.some((s) => s === '..' || s === '.'))
    return { ok: false, sensitive: false, reason: `relative segment in ${p}` };
  if (FORBIDDEN.some((r) => r.test(p)))
    return { ok: false, sensitive: false, reason: `forbidden path ${p}` };
  return { ok: true, sensitive: SENSITIVE.some((r) => r.test(p)) };
}

/** Paths touched by a unified diff (both sides, /dev/null excluded). */
export function patchPaths(diff) {
  const out = new Set();
  for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^(?:\+\+\+|---) (?:[ab]\/)?(.+?)\s*$/.exec(line);
    if (m && m[1] !== '/dev/null') out.add(m[1].replace(/\t.*$/, ''));
    const g = /^diff --git a\/(.+?) b\/(.+?)\s*$/.exec(line);
    if (g) {
      out.add(g[1]);
      out.add(g[2]);
    }
  }
  return [...out];
}

/**
 * The useful part of a failing `npm run check` log: error lines with a little context, capped
 * so it fits in a PR comment and costs a reader few tokens.
 * @param {string} log
 * @param {number} [max]
 */
export function extractErrors(log, max = 120) {
  const lines = log.replace(/\r\n/g, '\n').split('\n');
  const hit = /error|✖|×|FAIL|failed|Error:|AssertionError|expected|warn\]/i;
  const keep = new Set();
  lines.forEach((l, i) => {
    if (!hit.test(l)) return;
    for (let k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 4); k++) keep.add(k);
  });
  const picked = [...keep].sort((a, b) => a - b).map((i) => lines[i] ?? '');
  const body = picked.length ? picked : lines.slice(-40);
  return body.length > max
    ? [...body.slice(0, max), `… (${body.length - max} more lines)`].join('\n')
    : body.join('\n');
}

/** Task folder/file name → { id, issue, slug }. `GMR-123-add-spikes` → issue GMR-123. */
export function parseTaskName(name) {
  const base = name.replace(/\.(patch|diff|zip|bundle\.(txt|md))$/i, '');
  const m = /^(gmr-\d+)/i.exec(base);
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return { id: base, issue: m ? m[1].toUpperCase() : null, slug: slug || 'task' };
}
