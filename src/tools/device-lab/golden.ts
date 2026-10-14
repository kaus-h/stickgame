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
 * GMR-118: updated by design (centre attach changes every rope length).
 * GMR-100: updated because the hash now includes the active checkpoint index.
 */
export const GOLDEN: GoldenHashes = {
  mainFinal: '19fef760',
  mainAll: '5f1a9ce1',
  movingFinal: 'b9bdc6ba',
  movingAll: '1ff5d2f6',
};
