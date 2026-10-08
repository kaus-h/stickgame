// render: Phaser scenes, rigs, dashed rope, camera, VFX and HUD. Reads sim snapshots; never authoritative.
// May import core, sim types and content.
export type { FrameSource, RenderFrame, RuntimeStats } from './frame';
export { GameScene } from './scenes/GameScene';
export type { GameSceneOptions } from './scenes/GameScene';
export { TouchControlsView } from './TouchControlsView';
export type { TouchControlsViewState } from './TouchControlsView';
