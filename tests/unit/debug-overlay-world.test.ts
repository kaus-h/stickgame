import type * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import { parseLevel } from '../../src/content/level';
import { DebugOverlay } from '../../src/render/debug/DebugOverlay';
import type { RenderFrame } from '../../src/render/frame';
import type { LevelDef } from '../../src/sim';

vi.mock('phaser', () => ({}));
vi.mock('../../src/render/debug/format', () => ({
  EventLog: class {
    tail(): string[] {
      return [];
    }
  },
  formatOverlay: () => [],
  formatRace: () => 'race',
}));

function drawOverlay(level?: LevelDef): string {
  const text = {
    height: 20,
    setText: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setScrollFactor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
  };
  const graphics = {
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
  };
  const scene = {
    add: { graphics: () => graphics, text: () => text },
    input: { keyboard: { on: vi.fn(), off: vi.fn() } },
    scale: { height: 720 },
  } as unknown as Phaser.Scene;
  const overlay = new DebugOverlay(scene, level);
  overlay.setVisible(true);
  overlay.draw({
    current: {
      tick: 0,
      attemptTick: 0,
      player: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
      contacts: [],
    },
    stats: {},
  } as unknown as RenderFrame);
  overlay.destroy();
  return text.setText.mock.calls[0]?.[0] as string;
}

describe('debug overlay world metadata (GMR-120)', () => {
  it('shows the resolved notebook default for legacy levels', () => {
    expect(drawOverlay(parseLevel(lab01))).toContain('world notebook/-');
  });

  it('shows authored identifiers even when the family has no renderer support', () => {
    const level = parseLevel({ ...lab01, world: { family: 'future-world', subTheme: 'dusk' } });
    expect(drawOverlay(level)).toContain('world future-world/dusk');
  });

  it('shows an absent subTheme and absent level without inventing identifiers', () => {
    expect(drawOverlay(parseLevel({ ...lab01, world: { family: 'future-world' } }))).toContain(
      'world future-world/-',
    );
    expect(drawOverlay()).toContain('world -/-');
  });
});
