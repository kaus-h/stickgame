import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import {
  NullPlatformServices,
  type EntitlementService,
  type HapticImpact,
  type HapticsService,
  type PlatformCapabilities,
  type PlatformName,
  type ShareService,
  type StorageService,
} from '../PlatformServices';

const STYLE: Record<HapticImpact, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/**
 * The native iOS and Android shell (ADR-002, GMR-33). Same game, same simulation: this adapter only
 * supplies lifecycle, storage, haptics and sharing through Capacitor plugins. Purchases are not
 * wired yet (RevenueCat arrives with its own issue), so entitlements report 'unavailable'; ads and
 * achievements stay off. This is the only place @capacitor/* may be imported.
 */
export class CapacitorPlatformServices extends NullPlatformServices {
  override readonly name: PlatformName;
  override readonly capabilities: PlatformCapabilities = {
    ads: false,
    purchases: false,
    haptics: true,
    achievements: false,
    cloudSave: false,
    nativeShare: true,
  };

  constructor(platform: string = Capacitor.getPlatform()) {
    super();
    this.name = platform === 'ios' ? 'capacitor-ios' : 'capacitor-android';
  }

  /** `isActive` from @capacitor/app maps to "visible": false when backgrounded or interrupted. */
  override readonly onVisibilityChange = (listener: (visible: boolean) => void): (() => void) => {
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      listener(isActive);
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  };

  override readonly storage: StorageService = {
    load: async (key) => (await Preferences.get({ key })).value,
    save: async (key, value) => {
      await Preferences.set({ key, value });
    },
  };

  override readonly entitlements: EntitlementService = {
    owns: () => false,
    onChange: () => () => {},
    purchase: () => Promise.resolve('unavailable'),
    restore: () => Promise.resolve(),
  };

  override readonly haptics: HapticsService = {
    impact: (strength) => {
      // Fire and forget: a missing taptic engine must never throw into the game loop.
      void Haptics.impact({ style: STYLE[strength] }).catch(() => undefined);
    },
  };

  override readonly share: ShareService = {
    shareLink: async (request) => {
      try {
        const { value } = await Share.canShare();
        if (!value) return 'unavailable';
        await Share.share({
          title: request.title,
          text: request.text,
          ...(request.url ? { url: request.url } : {}),
        });
        return 'shared';
      } catch {
        return 'unavailable'; // includes the user dismissing the sheet
      }
    },
  };
}
