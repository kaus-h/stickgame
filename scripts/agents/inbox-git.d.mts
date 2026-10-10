export interface RunGitResult {
  ok: boolean;
  out: string;
  status: number | null;
}

export interface RunGitOptions {
  input?: string | Uint8Array;
  maxBuffer?: number;
}

export interface InboxWorktreeGuardResult {
  worktree: string;
  repository: string;
  branch: string;
  gitDirectory: string;
  commonDirectory: string;
}

export declare function gitEnvironment(
  environment?: Record<string, string | undefined>,
): Record<string, string | undefined>;

export declare function runGit(cwd: string, args: string[], options?: RunGitOptions): RunGitResult;

export declare function assertInboxWorktree(
  wt: string,
  repo: string,
  expectedBranch: string,
): InboxWorktreeGuardResult;

export declare function assertInboxPath(root: string, relativePath: string): string;

export declare function assertInboxTree(root: string): void;
