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
    if (/^={3,}\s*TASK:/.test(line)) continue; // header for downloads pickup (detectTask)
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
const FORBIDDEN = [
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.claude(\/|$)/i,
  /(^|\/)\.env[^/]*(\/|$)/i,
];
/** Paths that need Opus's explicit attention in review (flagged in the PR body). */
const SENSITIVE = [
  /^\.github\//i,
  /^package(-lock)?\.json$/i,
  /^AGENTS\.md$/i,
  /^CLAUDE\.md$/i,
  /^scripts\/agents\//i,
  /^src\/tools\/device-lab\/golden\.ts$/i,
  /^eslint\.config\.js$/i,
  /^\.dependency-cruiser\.cjs$/i,
];

function decodeGitQuotedPath(quoted) {
  if (!quoted.startsWith('"') || !quoted.endsWith('"'))
    throw new Error('malformed quoted path in Git diff');
  const body = quoted.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length;) {
    if (body[i] !== '\\') {
      const codePoint = body.codePointAt(i);
      const character = String.fromCodePoint(codePoint ?? 0xfffd);
      bytes.push(...Buffer.from(character, 'utf8'));
      i += character.length;
      continue;
    }

    const escaped = body[i + 1];
    if (escaped === undefined) throw new Error('malformed quoted path in Git diff');
    const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1))?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8));
      i += octal.length + 1;
    } else {
      const decoded = {
        a: '\x07',
        b: '\b',
        t: '\t',
        n: '\n',
        v: '\v',
        f: '\f',
        r: '\r',
        '"': '"',
        '\\': '\\',
      }[escaped];
      if (decoded === undefined) throw new Error('unsupported quoted Git path escape');
      bytes.push(...Buffer.from(decoded, 'utf8'));
      i += 2;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripDiffPrefix(path) {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

/**
 * Derive pre-format work from the paths written by an inbox task. The compiler owns this output;
 * include it in formatting only after the source schema has been recompiled.
 * @param {Iterable<string>} touched
 * @returns {{ regenerateSchema: boolean, generatedPaths: string[] }}
 */
export function preparationPaths(touched) {
  const regenerateSchema = [...touched].some(
    (path) => path.replace(/\\/g, '/').toLowerCase() === 'content/level.schema.json',
  );
  return {
    regenerateSchema,
    generatedPaths: regenerateSchema ? ['src/content/level-validator.generated.js'] : [],
  };
}

/**
 * Check one repo-relative path from a model's output.
 * @param {string} p
 * @returns {{ ok: boolean, sensitive: boolean, reason?: string }}
 */
export function checkPath(p) {
  if (!p) return { ok: false, sensitive: false, reason: 'empty path' };
  const normalized = p.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/') || normalized.startsWith('//'))
    return { ok: false, sensitive: false, reason: `absolute path ${p}` };
  const parts = normalized.split('/');
  if (parts.some((s) => s === '..' || s === '.'))
    return { ok: false, sensitive: false, reason: `relative segment in ${p}` };
  if (FORBIDDEN.some((r) => r.test(normalized)))
    return { ok: false, sensitive: false, reason: `forbidden path ${p}` };
  return { ok: true, sensitive: SENSITIVE.some((r) => r.test(normalized)) };
}

/** Paths touched by a unified diff (both sides, /dev/null excluded). */
export function patchPaths(diff) {
  const out = new Set();
  for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const header = line.slice('diff --git '.length);
      // Git emits ordinary spaced paths unquoted in this header. Preserve the existing split for
      // that form; the branches below decode C-quoted and mixed quoted/unquoted names.
      const unquoted = /^diff --git a\/(.+?) b\/(.+?)\s*$/.exec(line);
      if (unquoted) {
        out.add(unquoted[1] ?? '');
        out.add(unquoted[2] ?? '');
      } else if (header.startsWith('"')) {
        const pair = /^("(?:[^"\\]|\\.)*")\s+(.+)$/.exec(header);
        if (!pair) throw new Error('incomplete diff --git path pair');
        const first = decodeGitQuotedPath(pair[1] ?? '');
        const secondText = pair[2] ?? '';
        const second = secondText.startsWith('"') ? decodeGitQuotedPath(secondText) : secondText;
        out.add(stripDiffPrefix(first));
        out.add(stripDiffPrefix(second));
      } else {
        const pair = /^(a\/.+) ("(?:[^"\\]|\\.)*")$/.exec(header);
        if (!pair) throw new Error('malformed diff --git path pair');
        const first = pair[1] ?? '';
        const second = decodeGitQuotedPath(pair[2] ?? '');
        if (!first.startsWith('a/') || !second.startsWith('b/'))
          throw new Error('malformed mixed quoted Git diff paths');
        out.add(stripDiffPrefix(first));
        out.add(stripDiffPrefix(second));
      }
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const header = line.slice(4);
      let path;
      if (header.startsWith('"')) {
        const token = /^("(?:[^"\\]|\\.)*")(?:\t.*)?$/.exec(header);
        if (!token) throw new Error('malformed quoted Git diff path header');
        path = decodeGitQuotedPath(token[1] ?? '');
      } else {
        path = header.replace(/\t.*$/, '').trimEnd();
      }
      if (path !== '/dev/null') out.add(stripDiffPrefix(path));
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
  const clean = log
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n');
  const lines = clean.split('\n');
  while (lines.length > 0 && !(lines[lines.length - 1] ?? '').trim()) lines.pop();
  if (lines.every((line) => !line.trim())) {
    return clean.length > 0
      ? '(check log contained only whitespace)'
      : '(check produced no output)';
  }
  const hit = /error|✖|×|FAIL|failed|Error:|AssertionError|expected|warn\]/i;
  const keep = new Set();
  lines.forEach((l, i) => {
    if (!hit.test(l)) return;
    for (let k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 4); k++) keep.add(k);
  });
  let body;
  if (keep.size > 0) {
    body = [...keep].sort((a, b) => a - b).map((i) => lines[i] ?? '');
  } else {
    const lastNonempty = [];
    for (let i = lines.length - 1; i >= 0 && lastNonempty.length < 30; i--) {
      if ((lines[i] ?? '').trim()) lastNonempty.push(i);
    }
    const first = lastNonempty[lastNonempty.length - 1] ?? lines.length - 1;
    body = lines.slice(first);
  }
  while (body.length > 0 && !(body[body.length - 1] ?? '').trim()) body.pop();
  return body.length > max
    ? [...body.slice(0, max), `… (${body.length - max} more lines)`].join('\n')
    : body.join('\n');
}

/**
 * Recognise an inbox task in a downloaded file whose name was lost (the in-app browser saves
 * downloads as GUID-named .tmp files). The file must start with a TASK line, within its first
 * few lines:
 *   ===== TASK: GMR-123-short-name =====      (bundles)
 *   TASK: GMR-123-short-name                  (patches; git apply ignores text before the diff)
 * @param {string} head the first few KB of the file
 * @returns {{ name: string, ext: string } | null}
 */
export function detectTask(head) {
  const lines = head.replace(/\r\n/g, '\n').split('\n').slice(0, 8);
  let name = null;
  for (const l of lines) {
    const m = /^(?:={3,}\s*)?TASK:\s*([A-Za-z0-9][\w.-]{0,80}?)\s*(?:={3,})?\s*$/.exec(l.trim());
    if (m) {
      name = m[1] ?? null;
      break;
    }
  }
  if (!name) return null;
  if (/^={3,}\s*FILE:/m.test(head)) return { name, ext: '.bundle.txt' };
  if (/^(diff --git |--- )/m.test(head)) return { name, ext: '.patch' };
  return null;
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
