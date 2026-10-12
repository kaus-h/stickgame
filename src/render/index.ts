// render: Phaser scenes, rigs, dashed rope, camera, VFX and HUD. Reads sim snapshots; never authoritative.
// May import core, sim types and content.
export type { FrameSource, RenderFrame, RuntimeStats } from './frame';
export { GameScene } from './scenes/GameScene';
export type { GameSceneOptions } from './scenes/GameScene';
export { TouchControlsView } from './TouchControlsView';
export type { TouchControlsViewState } from './TouchControlsView';
export type { RaceView, SplitFlash } from './frame';
export { DELTA_COLOURS, formatDelta, formatRaceTime, SPLIT_VISIBLE_TICKS } from './race';
export type { DeltaTone } from './race';

export { loadLevelKit } from './kit/LevelKit';
export { loadHeroHeads } from './hero/heads';
