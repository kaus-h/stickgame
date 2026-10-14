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

/** Only notebook is authored. Future sub-themes use the key `family/subTheme`. */
export const WORLD_STYLES: Readonly<Record<string, WorldStyle>> = { notebook: NOTEBOOK_STYLE };

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

export function resolveWorldStyle(level: LevelDef): WorldStyle {
  return getWorldStyle(getLevelWorld(level));
}
