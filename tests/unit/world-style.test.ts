import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
vi.mock('phaser', () => ({}));
import {
  getWorldStyle,
  NOTEBOOK_STYLE,
  PENCIL_STYLE,
  resolveWorldStyle,
  WORLD_STYLES,
  worldColorCss,
  worldOverride,
  type WorldStyle,
} from '../../src/render/world/WorldStyle';
import { compileLevel } from '../../src/content';
import firstRope from '../../content/levels/1-1.json';
import movingPivots from '../../content/levels/2-1.json';
import { ensurePaperTexture, PAGE, paperTextureKey } from '../../src/render/page/NotebookPage';
import { addPageVignette, pageVignetteTextureKey } from '../../src/render/living/pageVignette';
import { resolveKitVersion } from '../../src/render/kit/Kit17Terrain';

describe('world style terrain kit selection', () => {
  it('uses the selected style kit when the URL does not specify one', () => {
    expect(resolveKitVersion('', '0016')).toBe('0016');
    expect(resolveKitVersion('?level=1-1', '0017')).toBe('0017');
  });

  it('falls back to the style kit for invalid overrides and to notebook for an unknown kit', () => {
    expect(resolveKitVersion('?kit=invalid', '0016')).toBe('0016');
    expect(resolveKitVersion('?kit=00160', '0017')).toBe('0017');
    expect(resolveKitVersion('', 'future-kit')).toBe('0017');
    expect(resolveKitVersion('?kit=invalid', 'future-kit')).toBe('0017');
  });

  it('keeps supported explicit URL overrides ahead of the style default', () => {
    expect(resolveKitVersion('?kit=0016', '0017')).toBe('0016');
    expect(resolveKitVersion('?level=1-1&kit=0017', '0016')).toBe('0017');
  });
});

describe('world style registry', () => {
  it('preserves the notebook palette, hatch spacing and asset selection', () => {
    expect(PAGE).toEqual({
      paper: 0xf3efe6,
      fibre: 0xd8cfbd,
      rule: 0x9ec2df,
      margin: 0xe28a8a,
      ink: 0x16161a,
      pencil: 0x8a8a8a,
      hole: 0xcfc7b6,
      wire: 0x4a4a50,
    });
    expect(NOTEBOOK_STYLE.paper.binding.highlight).toBe(0xb8b8c0);
    expect(NOTEBOOK_STYLE.terrainBorderInk).toBe(0x000000);
    expect(NOTEBOOK_STYLE.hatchDensity).toBe(1);
    expect(NOTEBOOK_STYLE.terrainKitKey).toBe('0017');
    expect(NOTEBOOK_STYLE.backgroundKey).toBe('kit17');
    expect(NOTEBOOK_STYLE.motes).toBe(true);
    expect(NOTEBOOK_STYLE.musicBankId).toBeUndefined();
    expect(Object.keys(WORLD_STYLES)).toEqual(['notebook', 'pencil']);
    expect(NOTEBOOK_STYLE.page).toBeUndefined();
    expect(NOTEBOOK_STYLE.terrainPainter).toBeUndefined();
  });

  it('preserves every approved lamp stop and pool position', () => {
    expect(NOTEBOOK_STYLE.lamp).toEqual({
      centre: { x: 0.56, y: 0.34 },
      pool: [
        { offset: 0, color: 'rgb(255, 255, 253)' },
        { offset: 0.26, color: 'rgb(251, 249, 245)' },
        { offset: 0.6, color: 'rgb(225, 218, 206)' },
        { offset: 1, color: 'rgb(168, 158, 144)' },
      ],
      gutter: [
        { offset: 0, color: 'rgb(176, 170, 162)' },
        { offset: 0.35, color: 'rgb(222, 218, 211)' },
        { offset: 1, color: 'rgb(255, 255, 255)' },
      ],
      fall: [
        { offset: 0, color: 'rgb(255, 255, 255)' },
        { offset: 1, color: 'rgb(234, 231, 225)' },
      ],
    });
  });

  it('falls back from sub-theme to family and from unsupported families to notebook', () => {
    const family = { ...NOTEBOOK_STYLE, id: 'test-family' };
    const subTheme = { ...NOTEBOOK_STYLE, id: 'test-sub-theme' };
    const registry = { notebook: NOTEBOOK_STYLE, test: family, 'test/night': subTheme };
    expect(getWorldStyle({ family: 'test', subTheme: 'night' }, registry)).toBe(subTheme);
    expect(getWorldStyle({ family: 'test', subTheme: 'missing' }, registry)).toBe(family);
    expect(getWorldStyle({ family: 'missing', subTheme: 'night' }, registry)).toBe(NOTEBOOK_STYLE);
    expect(getWorldStyle()).toBe(NOTEBOOK_STYLE);
    expect(getWorldStyle({ family: 'notebook', subTheme: 'future' })).toBe(NOTEBOOK_STYLE);
    expect(getWorldStyle({ family: 'missing' }, {})).toBe(NOTEBOOK_STYLE);
    expect(getWorldStyle({ family: 'constructor' })).toBe(NOTEBOOK_STYLE);
    expect(getWorldStyle({ family: '__proto__' })).toBe(NOTEBOOK_STYLE);
  });

  it('formats ink colors with leading zeroes and optional opacity', () => {
    expect(worldColorCss(0)).toBe('#000000');
    expect(worldColorCss(0x16161a)).toBe('#16161a');
    expect(worldColorCss(0x16161a, 0.4)).toBe('rgba(22,22,26,0.4)');
  });
});

describe('pencil world (chapter 1)', () => {
  it('is a ruled sketchbook with no margin line or binding, graphite terrain and shafts', () => {
    expect(PENCIL_STYLE.page).toEqual({ kind: 'sketchbook', margin: false, binding: false });
    expect(PENCIL_STYLE.terrainPainter).toBe('graphite');
    expect(PENCIL_STYLE.light).toBe('graphite-shafts');
    expect(PENCIL_STYLE.backgroundKey).toBe('pencil-vista');
    expect(PENCIL_STYLE.doodles).toBe(false);
    expect(PENCIL_STYLE.anchorHalo?.alpha).toBeGreaterThan(0.5);
  });

  it('keeps red out of the palette (red is reserved for lethal)', () => {
    const tokens = [
      PENCIL_STYLE.paper.base,
      PENCIL_STYLE.paper.fibre,
      PENCIL_STYLE.paper.rule,
      PENCIL_STYLE.paper.margin,
      PENCIL_STYLE.ink,
      PENCIL_STYLE.pencil,
      PENCIL_STYLE.terrainBorderInk,
      PENCIL_STYLE.anchorHalo?.color ?? 0,
    ];
    for (const c of tokens) {
      const r = (c >> 16) & 255,
        g = (c >> 8) & 255,
        b = c & 255;
      expect(r - Math.min(g, b)).toBeLessThan(24);
    }
  });

  it('resolves both chapter 1 sub-themes to pencil, and the ?world= override wins', () => {
    expect(getWorldStyle({ family: 'pencil', subTheme: 'margin-wilds' })).toBe(PENCIL_STYLE);
    expect(getWorldStyle({ family: 'pencil', subTheme: 'construction-lines' })).toBe(PENCIL_STYLE);
    const level = compileLevel(firstRope);
    expect(resolveWorldStyle(level, '')).toBe(PENCIL_STYLE);
    expect(resolveWorldStyle(level, '?level=1-1&world=notebook')).toBe(NOTEBOOK_STYLE);
    expect(resolveWorldStyle(compileLevel(movingPivots), '?world=pencil')).toBe(PENCIL_STYLE);
    expect(worldOverride('?world=unknown')).toBeNull();
    expect(worldOverride('?world=constructor')).toBeNull();
    expect(worldOverride('')).toBeNull();
  });
});

function textureHarness() {
  const created = new Map<string, { fills: string[]; stops: [number, string][] }>();
  const imageKeys: string[] = [];
  const scene = {
    textures: {
      exists: (key: string) => created.has(key),
      createCanvas: (key: string) => {
        const record = { fills: [] as string[], stops: [] as [number, string][] };
        created.set(key, record);
        const gradient = {
          addColorStop: (offset: number, color: string) => record.stops.push([offset, color]),
        };
        const context = {
          fillStyle: '',
          fillRect() {
            record.fills.push(this.fillStyle);
          },
          createRadialGradient: () => gradient,
          createLinearGradient: () => gradient,
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
        };
        return { getContext: () => context, refresh() {} };
      },
    },
    add: {
      image: (_x: number, _y: number, key: string) => {
        imageKeys.push(key);
        const image = {
          setOrigin: () => image,
          setScrollFactor: () => image,
          setDepth: () => image,
          setBlendMode: () => image,
        };
        return image;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, created, imageKeys };
}

describe('style-specific page textures', () => {
  const alternate: WorldStyle = {
    ...NOTEBOOK_STYLE,
    id: 'test-alternate',
    paper: { ...NOTEBOOK_STYLE.paper, base: 0x123456 },
    lamp: { ...NOTEBOOK_STYLE.lamp, pool: [{ offset: 0, color: 'rgb(1, 2, 3)' }] },
  };

  it('retains the shared default paper key and draws each style once', () => {
    const { scene, created } = textureHarness();
    ensurePaperTexture(scene);
    ensurePaperTexture(scene, alternate);
    ensurePaperTexture(scene, alternate);
    expect(paperTextureKey()).toBe('notebook-paper');
    expect([...created.keys()]).toEqual(['notebook-paper', 'notebook-paper:test-alternate']);
    expect(created.get(paperTextureKey())?.fills[0]).toBe('rgba(243,239,230,1)');
    expect(created.get(paperTextureKey(alternate))?.fills[0]).toBe('rgba(18,52,86,1)');
  });

  it('uses the selected lamp stops without reusing the preceding world texture', () => {
    const { scene, created, imageKeys } = textureHarness();
    addPageVignette(scene, 5);
    addPageVignette(scene, 5, alternate);
    expect(imageKeys).toEqual(['page-lamp', 'page-lamp:test-alternate']);
    expect(created.get(pageVignetteTextureKey())?.stops[0]).toEqual([0, 'rgb(255, 255, 253)']);
    expect(created.get(pageVignetteTextureKey(alternate))?.stops[0]).toEqual([0, 'rgb(1, 2, 3)']);
  });
});
