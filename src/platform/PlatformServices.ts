/**
 * Everything platform-specific the game needs, behind one interface (ADR-002, GMR-34).
 *
 * The simulation never sees this: only app composition roots and presentation code receive it.
 * Platform SDKs (Capacitor plugins, RevenueCat, portal SDKs, Steamworks bindings) are imported
 * only by the concrete adapters under src/platform/<adapter>, enforced by dependency-cruiser.
 */
export interface PlatformServices {
  readonly name: PlatformName;
  readonly capabilities: PlatformCapabilities;

  /** Subscribe to the app becoming hidden or visible (tab switch, app backgrounded). */
  onVisibilityChange(listener: (visible: boolean) => void): () => void;

  readonly storage: StorageService;
  readonly entitlements: EntitlementService;
  readonly ads: AdService;
  readonly haptics: HapticsService;
  readonly achievements: AchievementService;
  readonly share: ShareService;
  readonly analytics: AnalyticsSink;
  /** Portal lifecycle hooks (CrazyGames, Poki, YouTube Playables, Discord). No-ops elsewhere. */
  readonly portal: PortalHooks;
}

export type PlatformName =
  'null' | 'web' | 'web-portal' | 'capacitor-ios' | 'capacitor-android' | 'electron-steam';

export interface PlatformCapabilities {
  readonly ads: boolean;
  readonly purchases: boolean;
  readonly haptics: boolean;
  readonly achievements: boolean;
  readonly cloudSave: boolean;
  readonly nativeShare: boolean;
}

/** Saves and settings. Values are JSON strings owned by the caller (versioned save schema). */
export interface StorageService {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}

/**
 * Entitlements gate content, never mechanics or assists (doc 13). Product ids are the full list;
 * on iOS every content unlock goes through in-app purchase (App Store guideline 3.1.1).
 */
export type ProductId = 'chapter-1-full';

export type PurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'unavailable' | 'failed';

export interface EntitlementService {
  owns(product: ProductId): boolean;
  onChange(listener: () => void): () => void;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restore(): Promise<void>;
}

/**
 * Ads exist only on portal builds and only at session boundaries (doc 13). The slot type is the
 * enforcement: there is deliberately no slot for death, retry or mid-level, so code that tries to
 * show an ad between death and retry does not compile.
 */
export type AdSlot = 'session-start' | 'level-select' | 'chapter-complete';

export type AdResult = 'shown' | 'skipped' | 'unavailable';

export interface AdService {
  showAtSessionBoundary(slot: AdSlot): Promise<AdResult>;
}

export type HapticImpact = 'light' | 'medium' | 'heavy';

export interface HapticsService {
  impact(strength: HapticImpact): void;
}

export interface AchievementService {
  unlock(id: string): void;
}

export interface ShareRequest {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export interface ShareService {
  shareLink(request: ShareRequest): Promise<ShareResult>;
}

/** Privacy-reviewed telemetry events go here (doc 33); the sink decides transport. */
export interface AnalyticsEvent {
  readonly name: string;
  readonly props?: Readonly<Record<string, string | number | boolean>>;
}

export interface AnalyticsSink {
  track(event: AnalyticsEvent): void;
}

export interface PortalHooks {
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
}

const noop = (): void => {};

/** Everything off: tests, tools and headless runs. */
export class NullPlatformServices implements PlatformServices {
  readonly name: PlatformName = 'null';
  readonly capabilities: PlatformCapabilities = {
    ads: false,
    purchases: false,
    haptics: false,
    achievements: false,
    cloudSave: false,
    nativeShare: false,
  };

  readonly onVisibilityChange: (listener: (visible: boolean) => void) => () => void = () => noop;

  readonly storage: StorageService = {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
  };

  readonly entitlements: EntitlementService = {
    owns: () => false,
    onChange: () => noop,
    purchase: () => Promise.resolve('unavailable'),
    restore: () => Promise.resolve(),
  };

  readonly ads: AdService = { showAtSessionBoundary: () => Promise.resolve('unavailable') };
  readonly haptics: HapticsService = { impact: noop };
  readonly achievements: AchievementService = { unlock: noop };
  readonly share: ShareService = { shareLink: () => Promise.resolve('unavailable') };
  readonly analytics: AnalyticsSink = { track: noop };
  readonly portal: PortalHooks = {
    loadingFinished: noop,
    gameplayStart: noop,
    gameplayStop: noop,
  };
}

/** A recording mock for tests: every call is appended to `calls`. */
export class MockPlatformServices extends NullPlatformServices {
  readonly calls: string[] = [];
  private visibility: ((visible: boolean) => void)[] = [];
  private readonly owned = new Set<ProductId>();

  constructor(override readonly capabilities: PlatformCapabilities = allCapabilities()) {
    super();
  }

  override readonly onVisibilityChange = (listener: (visible: boolean) => void): (() => void) => {
    this.visibility.push(listener);
    return () => {
      this.visibility = this.visibility.filter((l) => l !== listener);
    };
  };

  setVisible(visible: boolean): void {
    for (const l of this.visibility) l(visible);
  }

  override readonly ads: AdService = {
    showAtSessionBoundary: (slot) => {
      this.calls.push(`ad:${slot}`);
      return Promise.resolve('shown');
    },
  };

  override readonly entitlements: EntitlementService = {
    owns: (p) => this.owned.has(p),
    onChange: () => noop,
    purchase: (p) => {
      this.calls.push(`purchase:${p}`);
      this.owned.add(p);
      return Promise.resolve('purchased');
    },
    restore: () => {
      this.calls.push('restore');
      return Promise.resolve();
    },
  };

  override readonly haptics: HapticsService = {
    impact: (s) => this.calls.push(`haptic:${s}`),
  };

  override readonly analytics: AnalyticsSink = {
    track: (e) => this.calls.push(`track:${e.name}`),
  };
}

function allCapabilities(): PlatformCapabilities {
  return {
    ads: true,
    purchases: true,
    haptics: true,
    achievements: true,
    cloudSave: true,
    nativeShare: true,
  };
}
