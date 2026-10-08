import type { PlatformServices } from './PlatformServices';
import { WebPlatformServices } from './web/WebPlatformServices';

/**
 * Picks the adapter for this runtime (ADR-002). The Capacitor native runtime injects a global
 * `window.Capacitor` before the web app loads, so detection needs no SDK import here: platform
 * SDKs may be imported only inside src/platform/<adapter>. The Capacitor adapter is loaded on
 * demand, so the website bundle only carries a tiny async chunk it never fetches.
 */
export async function createPlatformServices(): Promise<PlatformServices> {
  if (isCapacitorNative()) {
    const { CapacitorPlatformServices } = await import('./capacitor/CapacitorPlatformServices');
    return new CapacitorPlatformServices();
  }
  return new WebPlatformServices();
}

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}
