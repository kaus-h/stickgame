/**
 * Everything platform-specific the game needs, behind one interface (ADR-002, GMR-34).
 * GMR-18 only needs lifecycle; GMR-34 adds storage, entitlements, ads, haptics, share and analytics.
 */
export interface PlatformServices {
  readonly name: string;
  /** Subscribe to the app becoming hidden or visible (tab switch, app backgrounded). Returns an unsubscribe function. */
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}

export class NullPlatformServices implements PlatformServices {
  readonly name = 'null';

  onVisibilityChange(): () => void {
    return () => {};
  }
}
