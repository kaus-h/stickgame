import type { PlatformServices } from '../PlatformServices';

export class WebPlatformServices implements PlatformServices {
  readonly name = 'web';

  onVisibilityChange(listener: (visible: boolean) => void): () => void {
    const handler = (): void => {
      listener(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  }
}
