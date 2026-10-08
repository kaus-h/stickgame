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
export { SaveStore } from './save/SaveStore';
export {
  DEFAULT_SETTINGS,
  decodeSave,
  emptySave,
  encodeSave,
  migrate,
  MIGRATIONS,
  recordRun,
  sanitize,
  SAVE_VERSION,
  SaveVersionError,
} from './save/saveData';
export type {
  LevelRecord,
  PersonalBest,
  Migration,
  ReducedMotion,
  RunResult,
  SaveData,
  Settings,
} from './save/saveData';
export { memoryStorage } from './web/webStorage';
