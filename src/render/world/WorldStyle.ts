import { getLevelWorld, type LevelWorld } from '../../content/level';
import type { LevelDef } from '../../sim';

export function worldColorCss(color: number, alpha?: number): string {
  if (alpha === undefined) return `#${color.toString(16).padStart(6, '0')}`;
  return `rgba(${String((color >> 16) & 255)},${String((color >> 8) & 255)},${String(color & 255)},${String(alpha)})`;
}

export interface LampStop {
  readonly offset: number;
  readonly color: string;
}

/** Presentation tokens only: world families never change simulation behavior. */
export interface WorldStyle {
  readonly id: string;
  readonly paper: {
    readonly base: number;
    readonly fibre: number;
    readonly rule: number;
    readonly margin: number;
    readonly binding: {
      readonly hole: number;
      readonly wire: number;
      readonly highlight: number;
    };
  };
  readonly ink: number;
  readonly pencil: number;
  readonly terrainBorderInk: number;
  /** Multiplier for existing hatch counts; one preserves notebook spacing. */
  readonly hatchDensity: number;
  readonly lamp: {
    readonly centre: { readonly x: number; readonly y: number };
    readonly pool: readonly LampStop[];
    readonly gutter: readonly LampStop[];
    readonly fall: readonly LampStop[];
  };
  readonly terrainKitKey: string;
  readonly backgroundKey: string;
  readonly motes: boolean;
  readonly musicBankId?: string;
  /**
   * Page dressing. `ruled` is the college-ruled notebook; `sketchbook` is a toothy unruled page.
   * The margin line and the spiral binding are separate switches (red is reserved for lethal).
   */
  readonly page?: {
    readonly kind: 'ruled' | 'sketchbook';
    readonly margin: boolean;
    readonly binding: boolean;
  };
  /** `kit` paints the calibrated terrain kit; `graphite` paints dense pencil masses. */
  readonly terrainPainter?: 'kit' | 'graphite';
  /** Screen light: the notebook desk lamp, or graphite vignette with diagonal light shafts. */
  readonly light?: 'lamp' | 'graphite-shafts';
  /** Pale halo behind every anchor ring, so anchors stay the clearest mark on darker tones. */
  readonly anchorHalo?: { readonly color: number; readonly alpha: number; readonly radius: number };
  /** Living Notebook margin doodles (birds on a wire, spider, stars) and scenery clouds. */
  readonly doodles?: boolean;
}

/** Existing notebook visuals, copied without changing any approved token. */
export const NOTEBOOK_STYLE: WorldStyle = {
  id: 'notebook',
  paper: {
    base: 0xf3efe6,
    fibre: 0xd8cfbd,
    rule: 0x9ec2df,
    margin: 0xe28a8a,
    binding: { hole: 0xcfc7b6, wire: 0x4a4a50, highlight: 0xb8b8c0 },
  },
  ink: 0x16161a,
  pencil: 0x8a8a8a,
  terrainBorderInk: 0x000000,
  hatchDensity: 1,
  lamp: {
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
  },
  terrainKitKey: '0017',
  backgroundKey: 'kit17',
  motes: true,
};

/**
 * Chapter 1, The Mark (docs/art/worlds.md): a toothy cool blue-grey sketchbook page with graphite
 * light shafts, a colossal half-sketched landmark in mist, dense cross-hatched terrain masses and
 * dark foreground silhouettes. Concept: assets/concepts/0018-worlds/pencil.jpg (qualities only).
 * Both chapter 1 sub-themes resolve here until they get their own tokens.
 */
export const PENCIL_STYLE: WorldStyle = {
  id: 'pencil',
  paper: {
    base: 0xc3c7cc,
    fibre: 0x8e949c,
    rule: 0x6f8fb4,
    margin: 0xc3c7cc,
    binding: { hole: 0xc3c7cc, wire: 0x3a3c40, highlight: 0x9ca1a8 },
  },
  ink: 0x15161a,
  pencil: 0x5c6068,
  terrainBorderInk: 0x1c1d21,
  hatchDensity: 1.6,
  lamp: NOTEBOOK_STYLE.lamp,
  terrainKitKey: '0017',
  backgroundKey: 'pencil-vista',
  motes: true,
  page: { kind: 'sketchbook', margin: false, binding: false },
  terrainPainter: 'graphite',
  light: 'graphite-shafts',
  anchorHalo: { color: 0xf4f5f6, alpha: 0.85, radius: 1.15 },
  doodles: false,
};

/** Registered families. Sub-themes use the key `family/subTheme` and fall back to the family. */
export const WORLD_STYLES: Readonly<Record<string, WorldStyle>> = {
  notebook: NOTEBOOK_STYLE,
  pencil: PENCIL_STYLE,
};

/** Dev A/B override (`?world=notebook`, `?world=pencil`): a registered family name, else null. */
export function worldOverride(search: string): WorldStyle | null {
  const family = new URLSearchParams(search).get('world');
  return family && Object.hasOwn(WORLD_STYLES, family) ? (WORLD_STYLES[family] ?? null) : null;
}

export function getWorldStyle(
  world?: LevelWorld,
  registry: Readonly<Record<string, WorldStyle>> = WORLD_STYLES,
): WorldStyle {
  const lookup = (key: string): WorldStyle | undefined =>
    Object.hasOwn(registry, key) ? registry[key] : undefined;
  if (world?.subTheme) {
    const subTheme = lookup(`${world.family}/${world.subTheme}`);
    if (subTheme) return subTheme;
  }
  return (world && lookup(world.family)) || lookup('notebook') || NOTEBOOK_STYLE;
}

export function resolveWorldStyle(
  level: LevelDef,
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): WorldStyle {
  return worldOverride(search) ?? getWorldStyle(getLevelWorld(level));
}
