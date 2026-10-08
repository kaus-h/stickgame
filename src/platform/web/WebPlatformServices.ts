import {
  NullPlatformServices,
  type HapticsService,
  type PlatformCapabilities,
  type PlatformName,
  type ShareService,
  type StorageService,
} from '../PlatformServices';

const PREFIX = 'stickgame:';

/**
 * The game's own website build (ADR-002): free first act, no ads, no purchases yet (the native
 * and Steam builds sell the full chapter). Storage is localStorage; share uses the Web Share API
 * with a clipboard fallback; haptics use navigator.vibrate where the browser supports it.
 */
export class WebPlatformServices extends NullPlatformServices {
  override readonly name: PlatformName = 'web';
  override readonly capabilities: PlatformCapabilities = {
    ads: false,
    purchases: false,
    haptics: typeof navigator !== 'undefined' && 'vibrate' in navigator,
    achievements: false,
    cloudSave: false,
    nativeShare: typeof navigator !== 'undefined' && 'share' in navigator,
  };

  override readonly onVisibilityChange = (listener: (visible: boolean) => void): (() => void) => {
    const handler = (): void => {
      listener(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  };

  override readonly storage: StorageService = {
    load: (key) => {
      try {
        return Promise.resolve(localStorage.getItem(PREFIX + key));
      } catch {
        return Promise.resolve(null); // private mode or blocked storage: play without saves
      }
    },
    save: (key, value) => {
      try {
        localStorage.setItem(PREFIX + key, value);
      } catch {
        // Quota or blocked storage: saves are best-effort on the web.
      }
      return Promise.resolve();
    },
  };

  override readonly haptics: HapticsService = {
    impact: (strength) => {
      if (!this.capabilities.haptics) return;
      navigator.vibrate(strength === 'light' ? 8 : strength === 'medium' ? 16 : 30);
    },
  };

  override readonly share: ShareService = {
    shareLink: async (request) => {
      try {
        if (this.capabilities.nativeShare) {
          await navigator.share(request);
          return 'shared';
        }
        await navigator.clipboard.writeText(`${request.text} ${request.url}`);
        return 'copied';
      } catch {
        return 'unavailable';
      }
    },
  };
}
