import { beforeEach, describe, expect, it, vi } from 'vitest';

type StateListener = (state: { isActive: boolean }) => void;

const h = vi.hoisted(() => ({
  listeners: [] as ((s: { isActive: boolean }) => void)[],
  remove: vi.fn(() => Promise.resolve()),
  store: new Map<string, string>(),
  impact: vi.fn<(o: { style: string }) => Promise<void>>(() => Promise.resolve()),
  share: vi.fn<(o: Record<string, string>) => Promise<{ activityType: string }>>(() =>
    Promise.resolve({ activityType: 'x' }),
  ),
  canShare: vi.fn(() => Promise.resolve({ value: true })),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_event: string, cb: StateListener) => {
      h.listeners.push(cb);
      return Promise.resolve({ remove: h.remove });
    },
  },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: ({ key }: { key: string }) => Promise.resolve({ value: h.store.get(key) ?? null }),
    set: ({ key, value }: { key: string; value: string }) => {
      h.store.set(key, value);
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: h.impact },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: h.share, canShare: h.canShare } }));

import { CapacitorPlatformServices } from '../../src/platform/capacitor/CapacitorPlatformServices';
import { createPlatformServices } from '../../src/platform';

describe('CapacitorPlatformServices (GMR-33)', () => {
  beforeEach(() => {
    h.listeners.length = 0;
    h.store.clear();
    h.impact.mockClear();
    h.share.mockClear();
    h.remove.mockClear();
  });

  it('names itself after the native platform and reports no purchases yet', async () => {
    const ios = new CapacitorPlatformServices();
    expect(ios.name).toBe('capacitor-ios');
    expect(new CapacitorPlatformServices('android').name).toBe('capacitor-android');
    expect(ios.capabilities.purchases).toBe(false);
    expect(ios.capabilities.ads).toBe(false);
    expect(await ios.entitlements.purchase('chapter-1-full')).toBe('unavailable');
    expect(ios.entitlements.owns('chapter-1-full')).toBe(false);
  });

  it('maps appStateChange to visibility and removes the listener on unsubscribe', async () => {
    const p = new CapacitorPlatformServices();
    const seen: boolean[] = [];
    const off = p.onVisibilityChange((v) => seen.push(v));
    h.listeners[0]?.({ isActive: false });
    h.listeners[0]?.({ isActive: true });
    expect(seen).toEqual([false, true]);
    off();
    await Promise.resolve();
    expect(h.remove).toHaveBeenCalledTimes(1);
  });

  it('stores through Preferences', async () => {
    const p = new CapacitorPlatformServices();
    expect(await p.storage.load('save')).toBeNull();
    await p.storage.save('save', '{"v":1}');
    expect(await p.storage.load('save')).toBe('{"v":1}');
  });

  it('maps haptic strengths to impact styles', () => {
    const p = new CapacitorPlatformServices();
    p.haptics.impact('light');
    p.haptics.impact('heavy');
    expect(h.impact.mock.calls.map((c) => c[0].style)).toEqual(['LIGHT', 'HEAVY']);
  });

  it('shares text without an empty url and degrades when sharing is unavailable', async () => {
    const p = new CapacitorPlatformServices();
    expect(await p.share.shareLink({ title: 't', text: 'body', url: '' })).toBe('shared');
    expect(h.share.mock.calls[0]?.[0]).toEqual({ title: 't', text: 'body' });
    h.canShare.mockResolvedValueOnce({ value: false });
    expect(await p.share.shareLink({ title: 't', text: 'b', url: 'https://x' })).toBe(
      'unavailable',
    );
    h.share.mockRejectedValueOnce(new Error('Share canceled'));
    expect(await p.share.shareLink({ title: 't', text: 'b', url: 'https://x' })).toBe(
      'unavailable',
    );
  });

  it('the factory returns the web adapter outside a native shell', async () => {
    expect((await createPlatformServices()).name).toBe('web');
  });
});
