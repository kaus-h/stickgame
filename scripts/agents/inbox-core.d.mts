// Types for scripts/agents/inbox-core.mjs, used by tests/unit/inbox-core.test.ts.
export declare function parseBundle(text: string): {
  writes: { path: string; content: string }[];
  deletes: string[];
  errors: string[];
};
export declare function checkPath(p: string): { ok: boolean; sensitive: boolean; reason?: string };
export declare function patchPaths(diff: string): string[];
export declare function extractErrors(log: string, max?: number): string;
export declare function parseTaskName(name: string): {
  id: string;
  issue: string | null;
  slug: string;
};
