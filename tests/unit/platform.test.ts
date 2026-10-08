import { describe, expect, it } from 'vitest';
import { MockPlatformServices, NullPlatformServices, type AdSlot } from '../../src/platform';

describe('PlatformServices boundary (ADR-002)', () => {
  it('the null adapter is fully inert', async () => {
    const p = new NullPlatformServices();
    expect(Object.values(p.capabilities).every((c) => !c)).toBe(true);
    expect(await p.ads.showAtSessionBoundary('session-start')).toBe('unavailable');
    expect(await p.entitlements.purchase('chapter-1-full')).toBe('unavailable');
    expect(p.entitlements.owns('chapter-1-full')).toBe(false);
    expect(await p.storage.load('save')).toBeNull();
  });

  it('ad slots are session boundaries only: no death, retry or mid-level slot exists', () => {
    const slots: Record<AdSlot, true> = {
      'session-start': true,
      'level-select': true,
      'chapter-complete': true,
    };
    expect(Object.keys(slots).some((s) => /death|retry|respawn|level-?start|mid/.test(s))).toBe(
      false,
    );
    // @ts-expect-error a death-time ad slot must not type-check (doc 13 hard constraint)
    const bad: AdSlot = 'death';
    expect(bad).toBe('death');
  });

  it('the mock records calls and grants purchased content', async () => {
    const p = new MockPlatformServices();
    await p.entitlements.purchase('chapter-1-full');
    p.haptics.impact('light');
    p.analytics.track({ name: 'level_start' });
    expect(p.entitlements.owns('chapter-1-full')).toBe(true);
    expect(p.calls).toEqual(['purchase:chapter-1-full', 'haptic:light', 'track:level_start']);
  });
});
