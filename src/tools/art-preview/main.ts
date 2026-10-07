import * as Phaser from 'phaser';
import { NotebookPreviewScene } from './NotebookPreviewScene';

// Dev-only page: /art-preview.html?set=test-0005
const set = new URLSearchParams(window.location.search).get('set') ?? 'test-0005';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f3efe6',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [new NotebookPreviewScene(set)],
});
