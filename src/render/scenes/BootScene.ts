import * as Phaser from 'phaser';

/** Placeholder scene proving the toolchain boots. Replaced by the runtime skeleton in GMR-18. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'StickGame', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#f2ede4',
      })
      .setOrigin(0.5);
  }
}
