import type * as Phaser from 'phaser';
import frontUrl from '../../../assets/art/hero-0008/head-front.png';
import profileUrl from '../../../assets/art/hero-0008/head-profile.png';
import threeQuarterUrl from '../../../assets/art/hero-0008/head-three-quarter.png';
import deadUrl from '../../../assets/art/hero-0008/head-dead.png';
import type { HeadFrame } from './animator';
import type { HeadTransform } from './drawHero';

/**
 * The approved drawn heads (assets/concepts/0008-hero-parts-sheet.png, owner 2026-10-08; GMR-69).
 * Loaded once at boot like the level kit; a scene without them falls back to the ink head.
 */
const urls: Record<HeadFrame, string> = {
  front: frontUrl,
  profile: profileUrl,
  'three-quarter': threeQuarterUrl,
  dead: deadUrl,
};

let images: Record<HeadFrame, HTMLImageElement> | null = null;
let pending: Promise<void> | null = null;

export function loadHeroHeads(): Promise<void> {
  pending ??= Promise.all(
    (Object.keys(urls) as HeadFrame[]).map(async (frame) => {
      const image = new Image();
      image.src = urls[frame];
      await image.decode();
      return [frame, image] as const;
    }),
  ).then((entries) => {
    images = Object.fromEntries(entries) as Record<HeadFrame, HTMLImageElement>;
  });
  return pending;
}

const key = (frame: HeadFrame): string => `hero-head-${frame}`;

/** One head sprite (the player, or the PB ghost) placed every frame from heroHeadTransform. */
export class HeroHead {
  private readonly image: Phaser.GameObjects.Image | null;

  constructor(scene: Phaser.Scene, depth: number, alpha = 1) {
    if (!images) {
      this.image = null;
      return;
    }
    for (const frame of Object.keys(images) as HeadFrame[])
      if (!scene.textures.exists(key(frame))) scene.textures.addImage(key(frame), images[frame]);
    this.image = scene.add.image(0, 0, key('front')).setDepth(depth).setAlpha(alpha);
  }

  /** False when the heads were not loaded (labs, tests): draw the ink head instead. */
  get ready(): boolean {
    return this.image !== null;
  }

  place(t: HeadTransform, frame: HeadFrame, facing: -1 | 1, visible = true): void {
    if (!this.image) return;
    this.image
      .setTexture(key(frame))
      .setPosition(t.x, t.y)
      .setDisplaySize(t.size, t.size)
      .setRotation(t.rotation)
      .setFlipX(facing < 0)
      .setVisible(visible);
  }

  hide(): void {
    this.image?.setVisible(false);
  }
}
