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
 */
export const GOLDEN: GoldenHashes = {
  mainFinal: '1012e6e4',
  mainAll: 'd9395196',
  movingFinal: 'ccbe364f',
  movingAll: 'b2246af3',
};
