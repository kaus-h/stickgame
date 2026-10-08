// platform: the PlatformServices interface and its adapters (web, portal, capacitor, electron/steam). May import core only.
// Platform SDKs are imported only by the adapter folders here (ADR-002; enforced by dependency-cruiser).
export { MockPlatformServices, NullPlatformServices } from './PlatformServices';
export type {
  AchievementService,
  AdResult,
  AdService,
  AdSlot,
  AnalyticsEvent,
  AnalyticsSink,
  EntitlementService,
  HapticImpact,
  HapticsService,
  PlatformCapabilities,
  PlatformName,
  PlatformServices,
  PortalHooks,
  ProductId,
  PurchaseResult,
  ShareRequest,
  ShareResult,
  ShareService,
  StorageService,
} from './PlatformServices';
export { WebPlatformServices } from './web/WebPlatformServices';
export { createPlatformServices, isCapacitorNative } from './createPlatformServices';
