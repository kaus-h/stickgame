import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const REPOSITORY_CONTEXT_KEYS = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE',
  'GIT_REPLACE_REF_BASE',
]);

export function gitEnvironment(environment = process.env) {
  const cleaned = { ...environment };
  for (const key of Object.keys(cleaned)) {
    const normalized = key.toUpperCase();
    if (
      REPOSITORY_CONTEXT_KEYS.has(normalized) ||
      normalized === 'GIT_CONFIG' ||
      normalized === 'GIT_CONFIG_PARAMETERS' ||
      normalized === 'GIT_CONFIG_COUNT' ||
      /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(normalized)
    ) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

/** Run Git with an explicit working directory, independent of inherited Git context. */
export function runGit(cwd, args, options = {}) {
  const workingDirectory = resolve(cwd);
  const environment = gitEnvironment({ ...process.env, ...options.env });
  const result = spawnSync('git', ['-C', workingDirectory, ...args], {
    ...options,
    cwd: workingDirectory,
    env: environment,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    ok: result.status === 0,
    out: result.error ? `${output}${result.error.message}` : output,
    status: result.status,
  };
}

function checkedOutput(cwd, args, description) {
  const result = runGit(cwd, args);
  if (!result.ok) {
    throw new Error(
      `${description} failed (status ${String(result.status)}): ${result.out.trim()}`,
    );
  }
  return result.out.trim();
}

function canonicalPath(path) {
  return realpathSync.native(resolve(path));
}

function samePath(left, right) {
  const canonicalLeft = canonicalPath(left);
  const canonicalRight = canonicalPath(right);
  return process.platform === 'win32'
    ? canonicalLeft.toLocaleLowerCase('en-US') === canonicalRight.toLocaleLowerCase('en-US')
    : canonicalLeft === canonicalRight;
}

function ensurePlainDirectory(root) {
  let details;
  try {
    details = lstatSync(root);
  } catch (error) {
    throw new Error(`cannot inspect inbox root ${root}: ${error.message}`);
  }
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error(`inbox root must be a real directory: ${root}`);
  }
  return realpathSync.native(root);
}

/** Resolve an inbox-relative path while refusing lexical escape and existing link components. */
export function assertInboxPath(root, relativePath) {
  const rootPath = ensurePlainDirectory(resolve(root));
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    /^[a-zA-Z]:[\\/]/.test(relativePath) ||
    relativePath.startsWith('\\\\')
  ) {
    throw new Error(`inbox path must be relative: ${String(relativePath)}`);
  }

  const portablePath = relativePath.replace(/[\\/]+/g, sep);
  const candidate = resolve(rootPath, portablePath);
  const fromRoot = relative(rootPath, candidate);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`inbox path escapes root: ${relativePath}`);
  }

  let current = rootPath;
  for (const part of fromRoot.split(sep)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`inbox path contains a symlink or junction: ${relativePath}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return candidate;
}

/** Reject symlink and junction nodes anywhere in a task input or staging tree. */
export function assertInboxTree(root) {
  const rootDetails = lstatSync(resolve(root));
  if (rootDetails.isSymbolicLink())
    throw new Error(`inbox tree root is a symlink or junction: ${root}`);
  if (rootDetails.isFile()) return;
  const rootPath = ensurePlainDirectory(resolve(root));
  const pending = [rootPath];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of readdirSync(directory)) {
      const child = resolve(directory, entry);
      let details;
      try {
        details = lstatSync(child);
      } catch (error) {
        throw new Error(`cannot inspect inbox tree entry ${child}: ${error.message}`);
      }
      if (details.isSymbolicLink()) {
        throw new Error(`inbox tree contains a symlink or junction: ${child}`);
      }
      if (details.isDirectory()) pending.push(child);
    }
  }
}

/** Fail closed unless `wt` is the requested linked worktree on the requested branch. */
export function assertInboxWorktree(wt, repo, expectedBranch) {
  const worktreePath = canonicalPath(wt);
  const repositoryPath = canonicalPath(repo);
  if (samePath(worktreePath, repositoryPath)) {
    throw new Error('refusing the owner repository checkout; an inbox linked worktree is required');
  }
  if (/^(main|master)$/i.test(expectedBranch)) {
    throw new Error(`refusing protected branch ${expectedBranch}`);
  }

  const repositoryTop = canonicalPath(
    checkedOutput(repo, ['rev-parse', '--show-toplevel'], 'resolve repository top-level'),
  );
  if (!samePath(repositoryTop, repositoryPath)) {
    throw new Error(`repository path is not its Git top-level: ${repositoryPath}`);
  }

  const actualTop = canonicalPath(
    checkedOutput(wt, ['rev-parse', '--show-toplevel'], 'resolve worktree top-level'),
  );
  if (!samePath(actualTop, worktreePath)) {
    throw new Error(`worktree root mismatch: expected ${worktreePath}, got ${actualTop}`);
  }
  if (samePath(actualTop, repositoryPath)) {
    throw new Error('refusing the owner repository top-level');
  }

  const actualBranch = checkedOutput(wt, ['branch', '--show-current'], 'resolve worktree branch');
  if (actualBranch !== expectedBranch) {
    throw new Error(
      `worktree branch mismatch: expected ${expectedBranch}, got ${actualBranch || '(detached)'}`,
    );
  }

  const gitDirectory = canonicalPath(
    checkedOutput(wt, ['rev-parse', '--absolute-git-dir'], 'resolve worktree Git directory'),
  );
  const commonDirectoryOutput = checkedOutput(
    wt,
    ['rev-parse', '--git-common-dir'],
    'resolve Git common directory',
  );
  const commonDirectory = canonicalPath(
    isAbsolute(commonDirectoryOutput)
      ? commonDirectoryOutput
      : resolve(worktreePath, commonDirectoryOutput),
  );
  if (samePath(gitDirectory, commonDirectory)) {
    throw new Error('refusing a checkout that is not a linked worktree');
  }
  const repositoryCommonOutput = checkedOutput(
    repo,
    ['rev-parse', '--git-common-dir'],
    'resolve repository Git common directory',
  );
  const repositoryCommonDirectory = canonicalPath(
    isAbsolute(repositoryCommonOutput)
      ? repositoryCommonOutput
      : resolve(repositoryPath, repositoryCommonOutput),
  );
  if (!samePath(commonDirectory, repositoryCommonDirectory)) {
    throw new Error('worktree belongs to a different Git repository');
  }

  return {
    worktree: worktreePath,
    repository: repositoryPath,
    branch: actualBranch,
    gitDirectory,
    commonDirectory,
  };
}
