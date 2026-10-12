import type * as Phaser from 'phaser';
import frontUrl from '../../../assets/art/hero-0008/head-front.webp?no-inline';
import profileUrl from '../../../assets/art/hero-0008/head-profile.webp?no-inline';
import threeQuarterUrl from '../../../assets/art/hero-0008/head-three-quarter.webp?no-inline';
import type { HeadFrame } from './animator';
import type { HeadTransform } from './drawHero';

/**
 * The approved drawn heads (assets/concepts/0008-hero-parts-sheet.png, owner 2026-10-08; GMR-69).
 * Loaded once at boot like the level kit; a scene without them falls back to the ink head. The dead
 * head ships with the death-body follow-up; until then it stays out of the bundle.
 */
type LiveFrame = Exclude<HeadFrame, 'dead'>;
const urls: Record<LiveFrame, string> = {
  front: frontUrl,
  profile: profileUrl,
  'three-quarter': threeQuarterUrl,
};

let images: Record<LiveFrame, HTMLImageElement> | null = null;
let pending: Promise<void> | null = null;

export function loadHeroHeads(): Promise<void> {
  pending ??= Promise.all(
    (Object.keys(urls) as LiveFrame[]).map(async (frame) => {
      const image = new Image();
      image.src = urls[frame];
      await image.decode();
      return [frame, image] as const;
    }),
  ).then((entries) => {
    images = Object.fromEntries(entries) as Record<LiveFrame, HTMLImageElement>;
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
    for (const frame of Object.keys(images) as LiveFrame[])
      if (!scene.textures.exists(key(frame))) scene.textures.addImage(key(frame), images[frame]);
    this.image = scene.add.image(0, 0, key('front')).setDepth(depth).setAlpha(alpha);
  }

  /** False when the heads were not loaded (labs, tests): draw the ink head instead. */
  get ready(): boolean {
    return this.image !== null;
  }

  place(t: HeadTransform, frame: HeadFrame, facing: -1 | 1, visible = true): void {
    if (!this.image || frame === 'dead') return;
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
