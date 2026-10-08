export interface GoldenHashes {
  readonly mainFinal: string;
  readonly mainAll: string;
  readonly movingFinal: string;
  readonly movingAll: string;
}

/**
 * Reference hashes of the GMR-29 scripted replays (lab-01), computed in Node. Every device must
 * reproduce them exactly. tests/unit/device-lab.test.ts recomputes them and fails when the
 * simulation changes: update the values here (and say so in the PR) when that is intended.
 * GMR-100: updated because the hash now includes the active checkpoint index.
 */
export const GOLDEN: GoldenHashes = {
  mainFinal: '718c6968',
  mainAll: '1f5ad032',
  movingFinal: '7e2af593',
  movingAll: '00e44af0',
};
