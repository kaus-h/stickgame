export declare function prepareInboxFiles(
  wt: string,
  files: string[],
  run: (command: string, args: string[], cwd: string) => { ok: boolean; out: string },
): {
  ok: boolean;
  stage: 'schema' | 'format';
  out: string;
  files: string[];
};
