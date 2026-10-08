import {
  NullPlatformServices,
  type HapticsService,
  type PlatformCapabilities,
  type PlatformName,
  type ShareService,
  type StorageService,
} from '../PlatformServices';
import { createWebStorage } from './webStorage';

/**
 * The game's own website build (ADR-002): free first act, no ads, no purchases yet (the native
 * and Steam builds sell the full chapter). Storage is IndexedDB with localStorage and memory fallbacks; share uses the Web Share API
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

  /** IndexedDB, then localStorage, then memory (GMR-48); chosen once, lazily. */
  private readonly backend = createWebStorage();

  override readonly storage: StorageService = {
    load: async (key) => (await this.backend).load(key),
    save: async (key, value) => {
      await (await this.backend).save(key, value);
    },
  };

  /** Which storage backend is in use (diagnostics and tests). */
  async storageKind(): Promise<string> {
    return (await this.backend).kind;
  }

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
