#!/usr/bin/env node
// Patch inbox: lands code written by chat models (BrowserGPT) without spending agent tokens.
// A task is a folder or file in the inbox; this script puts it on a fresh branch from main,
// runs `npm run check` locally, pushes, and opens (or updates) a PR. No LLM runs here.
// Protocol and task format: docs/agents/workflow.md.
//
//   npm run inbox                      process every pending task once
//   npm run inbox -- --watch           keep polling (every 10 s)
//   npm run inbox -- GMR-123-spikes    process the named task(s) only
//   options: --inbox <dir>  --downloads "<dir>;<dir>"  --no-downloads  --no-check  --no-push
//            --keep-worktree
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPath,
  detectTask,
  extractErrors,
  parseBundle,
  parseTaskName,
  patchPaths,
} from './inbox-core.mjs';
import {
  runGit,
  assertInboxWorktree,
  assertInboxPath,
  assertInboxTree,
  gitEnvironment,
} from './inbox-git.mjs';
import { prepareInboxFiles } from './inbox-prepare.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const INBOX = resolve(
  opt('--inbox') ??
    process.env.STICKGAME_INBOX ??
    (process.platform === 'win32' ? 'D:/tmp/inbox' : join(homedir(), 'stickgame-inbox')),
);
const named = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--inbox' && args[i - 1] !== '--downloads',
);
const RESERVED = new Set(['done', 'failed', 'log.jsonl', 'README.md']);
const PARTIAL = /\.(crdownload|part|tmp|download)$/i;
const isWin = process.platform === 'win32';

/** Run a command; never throws. Output is captured, not streamed (keeps agent logs short). */
function run(cmd, cmdArgs, cwd, extraEnv = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd,
    encoding: 'utf8',
    shell: isWin && cmd === 'npm',
    env: gitEnvironment({ ...process.env, ...extraEnv }),
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error?.message ?? ''}` };
}
const git = (cwd, ...a) => runGit(cwd, a);

/** Downloads are still landing if a partial file exists or anything changed in the last 3 s. */
function settled(path) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path, { recursive: true }).map((f) => join(path, String(f)))
    : [path];
  const now = Date.now();
  return files.every((f) => !PARTIAL.test(f) && now - statSync(f).mtimeMs > 3000);
}

/**
 * Download folders to sweep for task files whose name was lost. The Claude desktop in-app
 * browser saves downloads to the root of D:\ as GUID-named .tmp files; a normal browser uses
 * ~/Downloads. Only files that start with a TASK line (detectTask) are moved; nothing else is
 * read past its first 4 KB or touched.
 */
const DOWNLOADS = flag('--no-downloads')
  ? []
  : (
      opt('--downloads') ??
      process.env.STICKGAME_DOWNLOADS ??
      (isWin ? `D:/;${join(homedir(), 'Downloads')}` : join(homedir(), 'Downloads'))
    )
      .split(';')
      .filter(Boolean)
      .map((d) => resolve(d));

function collectDownloads() {
  const now = Date.now();
  for (const dir of DOWNLOADS) {
    if (!existsSync(dir)) continue;
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!/\.(tmp|txt|md|patch|diff)$/i.test(n) || /\.(crdownload|part)$/i.test(n)) continue;
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (
        !st.isFile() ||
        st.size > 5 * 1024 * 1024 ||
        now - st.mtimeMs > 48 * 3600_000 ||
        now - st.mtimeMs < 3000
      )
        continue;
      let head = '';
      try {
        const fd = openSync(p, 'r');
        const buf = Buffer.alloc(4096);
        const len = readSync(fd, buf, 0, 4096, 0);
        closeSync(fd);
        head = buf.subarray(0, len).toString('utf8');
      } catch {
        continue;
      }
      const task = detectTask(head);
      if (!task) continue;
      let target = join(INBOX, `${task.name}${task.ext}`);
      for (let k = 2; existsSync(target); k++) target = join(INBOX, `${task.name}-${k}${task.ext}`);
      try {
        renameSync(p, target);
      } catch {
        cpSync(p, target);
        rmSync(p, { force: true });
      }
      console.log(`picked up ${n} → ${target}`);
    }
  }
}

function pendingTasks() {
  if (!existsSync(INBOX)) mkdirSync(INBOX, { recursive: true });
  return readdirSync(INBOX)
    .filter((n) => !RESERVED.has(n) && !n.startsWith('.') && !PARTIAL.test(n))
    .filter((n) => named.length === 0 || named.some((x) => n.startsWith(x)))
    .sort();
}

/** Collect a task's inputs into { meta, patches[], bundles[], filesDir } in a staging folder. */
function stage(name) {
  const src = join(INBOX, name);
  assertInboxTree(src);
  const stageDir = join(INBOX, '.staging', name);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  if (statSync(src).isDirectory()) cpSync(src, stageDir, { recursive: true });
  else if (/\.zip$/i.test(name)) {
    const r = isWin
      ? run('tar', ['-xf', src, '-C', stageDir], INBOX)
      : run('unzip', ['-q', src, '-d', stageDir], INBOX);
    if (!r.ok) throw new Error(`could not extract ${name}: ${r.out}`);
  } else cpSync(src, join(stageDir, name));
  assertInboxTree(stageDir);
  const all = readdirSync(stageDir, { recursive: true }).map((f) => String(f).replace(/\\/g, '/'));
  const metaFile = all.find((f) => /(^|\/)task\.json$/.test(f));
  const meta = metaFile ? JSON.parse(readFileSync(join(stageDir, metaFile), 'utf8')) : {};
  const filesRoot = all.find(
    (f) => /(^|\/)files$/.test(f) && statSync(join(stageDir, f)).isDirectory(),
  );
  return {
    meta,
    patches: all.filter((f) => /\.(patch|diff)$/i.test(f) && !f.startsWith(`${filesRoot}/`)).sort(),
    bundles: all.filter((f) => /\.bundle\.(txt|md)$/i.test(f)).sort(),
    filesDir: filesRoot ? join(stageDir, filesRoot) : null,
    stageDir,
  };
}

function processTask(name) {
  const started = Date.now();
  const t = parseTaskName(name);
  const s = stage(name);
  const issue = s.meta.issue ?? t.issue;
  const title =
    s.meta.title ??
    (t.id
      .replace(/^gmr-\d+[-_]?/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() ||
      t.id);
  const author = s.meta.author ?? 'BrowserGPT';
  const branch = s.meta.branch ?? `inbox/${t.slug}`;
  const base = s.meta.base ?? 'main';
  if (/^(main|master)$/i.test(branch)) throw new Error('refusing to push to main');
  if (!git(REPO, 'check-ref-format', '--branch', branch).ok) throw new Error('invalid task branch');
  const result = { task: name, issue, branch, ok: false, stage: 'prepare', notes: [] };

  // 1. Fresh worktree: from the task branch if a PR round already exists (fix round), else base.
  git(REPO, 'fetch', '-q', 'origin');
  const remoteBranch = git(REPO, 'rev-parse', '--verify', '-q', `origin/${branch}`).ok;
  const wt = join(REPO, '.claude', 'worktrees', `inbox-${t.slug}`);
  if (existsSync(wt)) git(REPO, 'worktree', 'remove', '--force', wt);
  git(REPO, 'branch', '-D', branch);
  const from = remoteBranch ? `origin/${branch}` : `origin/${base}`;
  const add = git(REPO, 'worktree', 'add', '-q', '-b', branch, wt, from);
  if (!add.ok) return finish(result, `worktree: ${add.out}`, started, s);
  assertInboxWorktree(wt, REPO, branch);
  result.round = remoteBranch ? 'fix' : 'new';

  // 2. Apply: patches (3-way), then bundles, then a files/ tree. Every path is checked first.
  result.stage = 'apply';
  const touched = new Set();
  const guard = (p) => {
    const c = checkPath(p);
    if (!c.ok) throw new Error(c.reason);
    assertInboxPath(wt, p);
    if (c.sensitive) result.notes.push(`sensitive path: ${p}`);
    touched.add(p);
  };
  try {
    for (const p of s.patches) {
      const diff = readFileSync(join(s.stageDir, p), 'utf8');
      patchPaths(diff).forEach(guard);
      const a = git(wt, 'apply', '--3way', '--whitespace=nowarn', join(s.stageDir, p));
      if (!a.ok) throw new Error(`git apply ${p} failed:\n${a.out.trim()}`);
      [...touched].forEach((path) => assertInboxPath(wt, path));
    }
    for (const b of s.bundles) {
      const parsed = parseBundle(readFileSync(join(s.stageDir, b), 'utf8'));
      if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
      for (const w of parsed.writes) {
        guard(w.path);
        mkdirSync(dirname(join(wt, w.path)), { recursive: true });
        writeFileSync(join(wt, w.path), w.content);
      }
      for (const d of parsed.deletes) {
        guard(d);
        rmSync(join(wt, d), { force: true });
      }
    }
    if (s.filesDir) {
      for (const f of readdirSync(s.filesDir, { recursive: true })) {
        const abs = join(s.filesDir, String(f));
        if (statSync(abs).isDirectory()) continue;
        const rel = relative(s.filesDir, abs).replace(/\\/g, '/');
        guard(rel);
        mkdirSync(dirname(join(wt, rel)), { recursive: true });
        cpSync(abs, join(wt, rel));
      }
    }
  } catch (e) {
    return finish(result, String(e instanceof Error ? e.message : e), started, s, wt);
  }
  if (touched.size === 0)
    return finish(result, 'task contained no patch, bundle or files/', started, s, wt);
  result.files = [...touched].sort();

  // 3. Format what the model wrote (models get Prettier details wrong; not worth a round trip).
  result.stage = 'install';
  const ci = run(
    'npm',
    ['ci', '--no-audit', '--no-fund', '--prefer-offline'],
    wt,
    isWin ? { TEMP: 'D:/tmp', TMP: 'D:/tmp' } : {},
  );
  if (!ci.ok) return finish(result, `npm ci failed:\n${extractErrors(ci.out)}`, started, s, wt);
  let prepared;
  try {
    prepared = prepareInboxFiles(wt, result.files, run);
  } catch (error) {
    return finish(result, `preparation path refused: ${String(error)}`, started, s, wt);
  }
  result.stage = prepared.stage;
  if (!prepared.ok)
    return finish(
      result,
      `${prepared.stage} preparation failed:\n${extractErrors(prepared.out)}`,
      started,
      s,
      wt,
    );
  prepared.files.forEach(guard);
  result.files = [...touched].sort();

  // 4. Local check (machine time, no tokens).
  let checkLog = '';
  if (!flag('--no-check') && s.meta.check !== false) {
    result.stage = 'check';
    const c = run('npm', ['run', 'check'], wt);
    result.checkOk = c.ok;
    if (!c.ok) checkLog = extractErrors(c.out);
    result.checkLog = checkLog || undefined;
  } else result.checkOk = null;

  // 5. Commit and push (a failed check still pushes, as a draft PR, so reviewers can read it).
  result.stage = 'commit';
  assertInboxWorktree(wt, REPO, branch);
  const staged = git(wt, '--literal-pathspecs', 'add', '-A', '--', ...result.files);
  if (!staged.ok) return finish(result, `stage failed: ${staged.out}`, started, s, wt);
  const index = git(wt, 'diff', '--cached', '--name-only', '-z');
  if (!index.ok) return finish(result, `cannot inspect index: ${index.out}`, started, s, wt);
  for (const path of index.out.split('\0').filter(Boolean)) {
    if (!checkPath(path).ok || !result.files.includes(path))
      return finish(result, `refusing unexpected staged path: ${path}`, started, s, wt);
  }
  const msg = [
    `${issue ? `${issue}: ` : ''}${title}`,
    '',
    s.meta.summary ?? '',
    '',
    `Landed by the patch inbox from ${author} output (round: ${result.round}).`,
    result.checkOk === false ? 'Local npm run check FAILED; see the PR comment.' : '',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  assertInboxWorktree(wt, REPO, branch);
  const cm = runGit(wt, ['commit', '-q', '-F', '-'], { input: msg });
  if (!cm.ok && !/nothing to commit/.test(cm.out))
    return finish(result, `commit failed: ${cm.out}`, started, s, wt);
  if (flag('--no-push')) {
    result.ok = result.checkOk !== false;
    return finish(result, null, started, s, wt);
  }
  result.stage = 'push';
  assertInboxWorktree(wt, REPO, branch);
  const push = git(wt, 'push', '-q', '-u', 'origin', `HEAD:${branch}`);
  if (!push.ok) return finish(result, `push failed: ${push.out}`, started, s, wt);

  // 6. PR: create, or comment on the existing one for a fix round.
  result.stage = 'pr';
  const existing = run(
    'gh',
    ['pr', 'view', branch, '--json', 'number,url', '--jq', '.number,.url'],
    wt,
  );
  const status =
    result.checkOk === false
      ? `❌ Local \`npm run check\` failed:\n\n\`\`\`\n${checkLog}\n\`\`\``
      : result.checkOk
        ? '✅ Local `npm run check` passed. CI runs e2e and the route solver.'
        : 'Local check skipped.';
  const notes = result.notes.length
    ? `\n\n**Needs Opus attention:**\n${result.notes.map((n) => `- ${n}`).join('\n')}`
    : '';
  const bodyFile = join(s.stageDir, 'pr-body.md');
  if (existing.ok) {
    const [num, url] = existing.out.trim().split('\n');
    writeFileSync(
      bodyFile,
      `<!-- patch-inbox -->\n**Inbox round (${result.round})** from ${author}: ${result.files.length} files.\n\n${status}${notes}\n`,
    );
    run('gh', ['pr', 'comment', num ?? branch, '--body-file', bodyFile], wt);
    // Draft while the local check fails, ready for review once it passes.
    run('gh', ['pr', 'ready', ...(result.checkOk === false ? ['--undo'] : []), num ?? branch], wt);
    result.pr = url;
  } else {
    writeFileSync(
      bodyFile,
      [
        `${s.meta.summary ?? title}`,
        '',
        issue ? `Linear: ${issue}` : '',
        `Source: ${author} via the patch inbox (docs/agents/workflow.md). Opus reviews before merge.`,
        '',
        `**Files:** ${result.files.map((f) => `\`${f}\``).join(', ')}`,
        '',
        status,
        notes,
        '',
        '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      ].join('\n'),
    );
    const pr = run(
      'gh',
      [
        'pr',
        'create',
        '--base',
        base,
        '--head',
        branch,
        '--title',
        `${issue ? `${issue}: ` : ''}${title}`,
        '--body-file',
        bodyFile,
        ...(result.checkOk === false ? ['--draft'] : []),
      ],
      wt,
    );
    if (!pr.ok) return finish(result, `gh pr create failed: ${pr.out}`, started, s, wt);
    result.pr = pr.out.trim().split('\n').pop();
  }
  result.ok = result.checkOk !== false;
  return finish(
    result,
    result.checkOk === false ? 'local check failed (draft PR has the log)' : null,
    started,
    s,
    wt,
  );
}

function finish(result, error, started, s, wt) {
  result.error = error ?? undefined;
  result.seconds = Math.round((Date.now() - started) / 1000);
  const dest = join(INBOX, result.ok ? 'done' : 'failed');
  mkdirSync(dest, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const moved = join(dest, `${stamp}_${result.task}`);
  renameSync(join(INBOX, result.task), moved);
  const report = [
    `# ${result.task}: ${result.ok ? 'landed' : 'FAILED'}`,
    '',
    `- stage: ${result.stage}`,
    `- branch: ${result.branch}`,
    result.pr ? `- PR: ${result.pr}` : '',
    result.files ? `- files: ${result.files.join(', ')}` : '',
    result.notes.length ? `- notes: ${result.notes.join('; ')}` : '',
    error ? `\n## Error\n\n\`\`\`\n${error}\n\`\`\`` : '',
    result.checkLog ? `\n## npm run check (errors only)\n\n\`\`\`\n${result.checkLog}\n\`\`\`` : '',
  ]
    .filter(Boolean)
    .join('\n');
  writeFileSync(
    statSync(moved).isDirectory() ? join(moved, 'RESULT.md') : `${moved}.RESULT.md`,
    `${report}\n`,
  );
  rmSync(s.stageDir, { recursive: true, force: true });
  if (wt && !flag('--keep-worktree') && existsSync(wt))
    git(REPO, 'worktree', 'remove', '--force', wt);
  const line = JSON.stringify({ ...result, checkLog: undefined, at: new Date().toISOString() });
  appendFileSync(join(INBOX, 'log.jsonl'), `${line}\n`);
  // One short line per task: what an agent reads to know the outcome.
  console.log(
    `${result.ok ? 'OK  ' : 'FAIL'} ${result.task} ${result.pr ?? ''} ${error ? `(${error.split('\n')[0]})` : ''}`.trim(),
  );
  return result;
}

function sweep() {
  collectDownloads();
  for (const name of pendingTasks()) {
    if (!settled(join(INBOX, name))) continue;
    try {
      processTask(name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAIL ${name} (${msg.split('\n')[0]})`);
      appendFileSync(
        join(INBOX, 'log.jsonl'),
        `${JSON.stringify({ task: name, ok: false, error: msg, at: new Date().toISOString() })}\n`,
      );
      const dest = join(INBOX, 'failed');
      mkdirSync(dest, { recursive: true });
      try {
        renameSync(join(INBOX, name), join(dest, `${Date.now()}_${name}`));
      } catch {
        /* already moved */
      }
    }
  }
}

if (flag('--watch')) {
  console.log(`patch inbox watching ${INBOX}`);
  sweep();
  setInterval(sweep, 10_000);
} else {
  sweep();
}
