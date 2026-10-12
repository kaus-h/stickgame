import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertInboxPath,
  assertInboxTree,
  assertInboxWorktree,
  gitEnvironment,
  runGit,
} from '../../scripts/agents/inbox-git.mjs';

const tempBase =
  process.env.STICKGAME_TEST_TMP ?? (process.platform === 'win32' ? 'D:/tmp' : tmpdir());
let tempRoot: string;
let repo: string;
let worktree: string;
let foreignRepo: string;
let foreignWorktree: string;
let nestedPath: string;

function requireGit(cwd: string, args: string[], options?: { input?: string }) {
  const result = runGit(cwd, args, options);
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.out.trim()}`);
  return result.out.trim();
}

function restoreEnvironment(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

beforeAll(() => {
  mkdirSync(tempBase, { recursive: true });
  tempRoot = mkdtempSync(join(tempBase, 'stickgame-gmr109-gitguard-'));
  repo = join(tempRoot, 'owner');
  worktree = join(tempRoot, 'inbox-worktree');
  nestedPath = join(repo, 'nested');
  foreignRepo = join(tempRoot, 'foreign-owner');
  foreignWorktree = join(tempRoot, 'foreign-worktree');
  mkdirSync(repo);
  mkdirSync(foreignRepo);

  requireGit(repo, ['init', '--initial-branch=main']);
  writeFileSync(join(repo, 'seed.txt'), 'isolated git guard fixture\n');
  requireGit(repo, ['add', 'seed.txt']);
  requireGit(
    repo,
    [
      '-c',
      'user.name=Git Guard Test',
      '-c',
      'user.email=git-guard@example.invalid',
      'commit',
      '-F',
      '-',
    ],
    { input: 'fixture commit\n' },
  );
  requireGit(repo, ['worktree', 'add', '-b', 'inbox/gmr109-test', worktree, 'main']);
  requireGit(foreignRepo, ['init', '--initial-branch=main']);
  writeFileSync(join(foreignRepo, 'seed.txt'), 'foreign repository fixture\n');
  requireGit(foreignRepo, ['add', 'seed.txt']);
  requireGit(
    foreignRepo,
    [
      '-c',
      'user.name=Git Guard Test',
      '-c',
      'user.email=git-guard@example.invalid',
      'commit',
      '-F',
      '-',
    ],
    { input: 'foreign fixture commit\n' },
  );
  requireGit(foreignRepo, ['worktree', 'add', '-b', 'inbox/gmr109-test', foreignWorktree, 'main']);
  mkdirSync(nestedPath);
});

afterAll(() => {
  if (repo && worktree) runGit(repo, ['worktree', 'remove', '--force', worktree]);
  if (foreignRepo && foreignWorktree)
    runGit(foreignRepo, ['worktree', 'remove', '--force', foreignWorktree]);
  if (tempRoot) {
    const realBase = realpathSync(tempBase);
    const realRoot = realpathSync(tempRoot);
    const expectedPrefix = 'stickgame-gmr109-gitguard-';
    const samePath = (left: string, right: string) =>
      process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

    if (!samePath(dirname(realRoot), realBase) || !basename(realRoot).startsWith(expectedPrefix)) {
      throw new Error(`Refusing to recursively remove unexpected test directory: ${realRoot}`);
    }

    rmSync(realRoot, { recursive: true, force: true });
  }
});

describe('inbox Git context guard', () => {
  it('uses the explicit linked-worktree root despite inherited Git environment', () => {
    const injected = {
      GIT_DIR: join(repo, '.git'),
      GIT_WORK_TREE: repo,
      GIT_INDEX_FILE: join(repo, '.git', 'index'),
      GIT_COMMON_DIR: join(repo, '.git'),
      GIT_PREFIX: 'owner-checkout-prefix',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'true',
    };
    const previous = new Map(Object.keys(injected).map((key) => [key, process.env[key]] as const));

    try {
      Object.assign(process.env, injected);
      const result = runGit(worktree, ['rev-parse', '--show-toplevel']);
      expect(result).toMatchObject({ ok: true, status: 0 });
      expect(realpathSync(result.out.trim())).toBe(realpathSync(worktree));
      expect(runGit(worktree, ['branch', '--show-current']).out.trim()).toBe('inbox/gmr109-test');
    } finally {
      restoreEnvironment(previous);
    }
  });

  it('commits in the linked worktree without changing the owner HEAD or index', () => {
    const ownerHeadBefore = requireGit(repo, ['rev-parse', 'HEAD']);
    const ownerIndex = join(repo, '.git', 'index');
    const ownerIndexBefore = readFileSync(ownerIndex);
    writeFileSync(join(worktree, 'inbox.txt'), 'must stay in the linked worktree\n');
    const injected = {
      GIT_DIR: join(repo, '.git'),
      GIT_WORK_TREE: repo,
      GIT_INDEX_FILE: ownerIndex,
      GIT_COMMON_DIR: join(repo, '.git'),
      GIT_PREFIX: 'owner-checkout-prefix',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'true',
    };
    const previous = new Map(Object.keys(injected).map((key) => [key, process.env[key]] as const));

    try {
      Object.assign(process.env, injected);
      expect(runGit(worktree, ['add', 'inbox.txt'])).toMatchObject({ ok: true, status: 0 });
      expect(
        runGit(
          worktree,
          [
            '-c',
            'user.name=Git Guard Test',
            '-c',
            'user.email=git-guard@example.invalid',
            'commit',
            '-F',
            '-',
          ],
          { input: 'inbox worktree commit\n' },
        ),
      ).toMatchObject({ ok: true, status: 0 });
    } finally {
      restoreEnvironment(previous);
    }

    expect(requireGit(repo, ['rev-parse', 'HEAD'])).toBe(ownerHeadBefore);
    expect(readFileSync(ownerIndex)).toEqual(ownerIndexBefore);
    expect(requireGit(worktree, ['rev-parse', 'HEAD'])).not.toBe(ownerHeadBefore);
    expect(requireGit(worktree, ['branch', '--show-current'])).toBe('inbox/gmr109-test');
  });

  it('accepts only the expected linked inbox worktree and branch', () => {
    const result = assertInboxWorktree(worktree, repo, 'inbox/gmr109-test');
    expect(result.branch).toBe('inbox/gmr109-test');
    expect(result.worktree).toBe(realpathSync(worktree));
    expect(result.repository).toBe(realpathSync(repo));
    expect(result.gitDirectory).not.toBe(result.commonDirectory);
  });

  it('refuses a linked worktree from a different repository with the same branch name', () => {
    expect(() => assertInboxWorktree(foreignWorktree, repo, 'inbox/gmr109-test')).toThrow(
      /different Git repository/,
    );
  });

  it('cleans repository context and config injection but preserves user config and auth', () => {
    const environment = gitEnvironment({
      GIT_DIR: repo,
      GIT_WORK_TREE: repo,
      GIT_INDEX_FILE: join(repo, '.git', 'index'),
      GIT_COMMON_DIR: join(repo, '.git'),
      GIT_PREFIX: 'owner-checkout-prefix',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'true',
      GIT_CONFIG_PARAMETERS: "'core.bare=true'",
      GIT_CONFIG_GLOBAL: join(tempRoot, 'user.gitconfig'),
      GIT_SSH_COMMAND: 'ssh -F user-ssh-config',
      HOME: join(tempRoot, 'user-home'),
    });

    expect(environment).not.toHaveProperty('GIT_DIR');
    expect(environment).not.toHaveProperty('GIT_WORK_TREE');
    expect(environment).not.toHaveProperty('GIT_INDEX_FILE');
    expect(environment).not.toHaveProperty('GIT_COMMON_DIR');
    expect(environment).not.toHaveProperty('GIT_PREFIX');
    expect(environment).not.toHaveProperty('GIT_CONFIG_COUNT');
    expect(environment).not.toHaveProperty('GIT_CONFIG_KEY_0');
    expect(environment).not.toHaveProperty('GIT_CONFIG_VALUE_0');
    expect(environment).not.toHaveProperty('GIT_CONFIG_PARAMETERS');
    expect(environment.GIT_CONFIG_GLOBAL).toBe(join(tempRoot, 'user.gitconfig'));
    expect(environment.GIT_SSH_COMMAND).toBe('ssh -F user-ssh-config');
    expect(environment.HOME).toBe(join(tempRoot, 'user-home'));
  });

  it('refuses the owner checkout even when it is a valid main repository', () => {
    expect(() => assertInboxWorktree(repo, repo, 'main')).toThrow(/owner repository checkout/);
  });

  it('refuses protected main or master branches even when requested explicitly', () => {
    expect(() => assertInboxWorktree(worktree, repo, 'main')).toThrow(/protected branch/);
    expect(() => assertInboxWorktree(worktree, repo, 'master')).toThrow(/protected branch/);
  });

  it('refuses a linked worktree on the wrong branch', () => {
    expect(() => assertInboxWorktree(worktree, repo, 'inbox/another-task')).toThrow(
      /worktree branch mismatch/,
    );
  });

  it('refuses a nested directory whose actual Git top-level is the owner checkout', () => {
    expect(() => assertInboxWorktree(nestedPath, repo, 'inbox/gmr109-test')).toThrow(
      /worktree root mismatch/,
    );
  });

  it('refuses directory junctions before resolving a nested path or scanning a task tree', () => {
    const taskInput = join(tempRoot, 'task-input');
    const link = join(taskInput, 'redirect');
    mkdirSync(taskInput);
    symlinkSync(repo, link, process.platform === 'win32' ? 'junction' : 'dir');
    const ownerSeed = readFileSync(join(repo, 'seed.txt'), 'utf8');

    expect(() => assertInboxPath(taskInput, 'redirect/seed.txt')).toThrow(/symlink or junction/);
    expect(() => {
      assertInboxTree(taskInput);
    }).toThrow(/symlink or junction/);
    expect(readFileSync(join(repo, 'seed.txt'), 'utf8')).toBe(ownerSeed);
  });

  it('rejects lexical paths that escape the supplied root', () => {
    expect(() => assertInboxPath(worktree, '../owner/seed.txt')).toThrow(/escapes root/);
    expect(() => assertInboxPath(worktree, 'nested/../../owner/seed.txt')).toThrow(/escapes root/);
  });

  it('accepts a standalone task file and refuses a linked tree root', () => {
    expect(() => {
      assertInboxTree(join(repo, 'seed.txt'));
    }).not.toThrow();
    const linkedRoot = join(tempRoot, 'linked-task-root');
    symlinkSync(repo, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => {
      assertInboxTree(linkedRoot);
    }).toThrow(/symlink or junction/);
  });
});
