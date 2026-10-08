import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell config (GMR-33, ADR-002). The shell only hosts the web build in a WebView; the game
 * is the same code on every target (no mobile-specific simulation).
 *
 * `appId` is a PLACEHOLDER. The owner must choose the final reverse-DNS bundle id before any
 * store submission (changing it later means a different app listing). Landscape-only and the
 * hidden status bar are set in the native manifests (see docs/device-validation.md).
 */
const config: CapacitorConfig = {
  appId: 'com.kaush.stickgame',
  appName: 'Precision Tether',
  webDir: 'dist',
  ios: {
    path: 'native/ios',
    // The game draws edge to edge and reads safe-area insets itself (env(safe-area-inset-*)).
    contentInset: 'never',
  },
  android: {
    path: 'native/android',
    allowMixedContent: false,
  },
};

export default config;
