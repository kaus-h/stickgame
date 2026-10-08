# Native shell device validation (GMR-33)

Early check that the game's web build behaves on real phones inside the Capacitor shell (ADR-002) before more content is built on it. The shell hosts the same web build in a WebView. There is no mobile-specific simulation.

You run a **device lab** (a measuring page) on each device, tap a few times, leave it for 15 minutes, press **Copy JSON** and fill in the results table at the bottom.

## What is already done

- `capacitor.config.ts` (appId `com.kaush.stickgame` is a **placeholder**: choose the final bundle id before any store submission; changing it later creates a different app listing).
- Native projects generated and committed: `native/android` (Gradle) and `native/ios` (Xcode project using Swift Package Manager, no CocoaPods needed).
- Landscape only (Android `sensorLandscape`; iOS landscape left and right). Status bar hidden; Android also hides the navigation bar (swipe from the edge to show it). iOS `contentInset: never`. Android `allowMixedContent: false`.
- Plugins: `@capacitor/app` (lifecycle), `preferences` (saves), `haptics`, `share`. No in-app purchase yet (RevenueCat comes later; entitlements report `unavailable`).
- `src/platform/capacitor/CapacitorPlatformServices.ts` is chosen at startup by `createPlatformServices()` when the page runs inside the native shell.
- Not verified on this Windows machine: Gradle build, Xcode build, anything on a device (no Android SDK, no Mac).

## Constraints to keep in mind (documented, not fought)

- **iOS WKWebView presents at most 60 fps** (WebKit bug 294338), even on 120 Hz ProMotion iPhones. The simulation is a fixed 60 Hz step, so this does not change gameplay; it caps display smoothness. Android WebViews may run 90 or 120 Hz.
- iOS allows few `AudioContext`s: the game uses one, and must handle `interrupted` then `running` (calls, Siri, backgrounding). The lab logs those transitions.
- iOS builds need your Mac. A free Apple ID is enough for installing on your own device (the app expires after 7 days and must be reinstalled).
- Android needs Android Studio and USB debugging on your phone.

## Device matrix

| Slot                                                        | Why it is in the matrix                                             | Your device |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ----------- |
| Recent ProMotion iPhone (13 Pro or newer)                   | Best case; confirms the 60 fps WebKit cap and 120 Hz touch sampling |             |
| Older iPhone (iPhone 8/X/11 era)                            | Worst iOS case: slower GPU and thermals                             |             |
| Low-end Android (about 3 GB RAM, budget SoC, 2-3 years old) | Worst Android case; sets the floor                                  |             |
| Mid-range Android (recent, 6-8 GB RAM)                      | Typical player                                                      |             |

If you lack a slot, run what you have and write "not tested" in the table; do not substitute a simulator or emulator (their timing and audio numbers are meaningless).

## Before any device: build the lab

From the repo root (Node 22.12 or newer):

```bash
npm install
npm run cap:sync:device-lab   # builds the lab as the app's launch scene, then copies it into both native projects
```

This builds with `--mode device-lab`, so the installed app **opens straight into the lab**. To go back to the game afterwards run `npm run cap:sync`. You can also open the lab in any browser with `?scene=device-lab` (add `&duration=60` for a one-minute run), which is how to sanity-check on a desktop: the numbers will pass easily and mean nothing for phones.

## Android runbook

1. Install **Android Studio** (current stable) from developer.android.com/studio. On first launch accept the SDK it offers (Android SDK Platform 36, Platform-Tools).
2. On the phone: Settings > About phone > tap **Build number** 7 times > back > Developer options > enable **USB debugging**. Also set **Stay awake** on (screen stays on while charging) and turn off battery saver.
3. Connect by USB, accept the "Allow USB debugging?" prompt on the phone.
4. `npm run cap:android` opens the project in Android Studio. Wait for the Gradle sync to finish (first time downloads a lot).
5. Pick your phone in the device dropdown (top bar) and press **Run** (green triangle). The lab opens full screen.
6. Unplug-test thermals: a charging phone runs warmer, which is realistic for the worst case. For the 15 minute run keep it plugged in and **in your hand or lying flat, in a case if you normally use one**.

## iOS runbook (on your Mac)

1. Install **Xcode** (App Store) and open it once to accept the licence and install components.
2. Clone the repo, run `npm install`, then `npm run cap:sync:device-lab` (works on macOS; `cap sync` needs no CocoaPods because the project uses Swift Package Manager).
3. `npm run cap:ios` opens `native/ios/App/App.xcodeproj`.
4. Xcode > Settings > Accounts > add your Apple ID (free account is fine).
5. Select the **App** project > target **App** > Signing & Capabilities > tick **Automatically manage signing** and choose your **Personal Team**. If Xcode says the bundle id is taken, change it to something unique such as `com.<yourname>.stickgame-lab` (it is only for this test).
6. Connect the iPhone by cable, unlock it, tap **Trust This Computer**. On iOS 16 and newer also enable **Settings > Privacy & Security > Developer Mode** (the phone restarts).
7. Pick the iPhone as the run destination (top bar) and press **Run**.
8. First launch fails with "Untrusted Developer": on the phone go to **Settings > General > VPN & Device Management > your Apple ID > Trust**, then launch the app again from the Home Screen.
9. Set **Settings > Display & Brightness > Auto-Lock > Never** for the run (the lab also asks for a screen wake lock, but do not rely on it).
10. Free provisioning expires after 7 days; re-run from Xcode to reinstall.

## Running the lab on a device

1. Launch the app. It opens in the lab. If the panel hides the tap area, use the **panel** button (top-left) to hide it.
2. Let it run 15 minutes (the run length is the number box in the panel; **Restart run** applies it). **Keep the app in the foreground and the screen on.** Do not touch the phone except for the steps below.
3. **Touch-to-render:** during the run, tap the screen 10 or more times, spaced out. Each tap flashes the screen white. The panel records tap-to-next-frame latency.
   - _Camera confirmation (recommended once per device):_ film the phone and your finger with a 240 fps slow-motion camera. Count frames from fingertip contact to the white flash; at 240 fps one frame is 4.2 ms. Compare with the lab's p50.
4. **Audio:** tap **Unlock audio**, then **Click test** several times. Then press Home (or switch app) for 10 seconds and come back: the lab logs the audio state change and the recovery time. On iPhone also test a phone call or Siri interruption once if you can (an `interrupted` state should return to `running`).
5. **Rotation and lifecycle:** rotate between landscape left and right (and lock/unlock the phone once). Events are logged.
6. **WebGL context loss:** press **Force context loss**. The log must show `lost` then `restored`, and the bar animation must resume.
7. **Determinism:** shown automatically 1 second after launch. The panel lists the device's final replay hashes and the golden ones. They must match exactly.
8. When the run says DONE, press **Copy JSON** (or **Share JSON** to send it to yourself by AirDrop, Messages or e-mail) and paste it into a file named `results/<device>.json` (any place you like), plus fill the table below. Attach the JSON to GMR-33.

The golden hashes live in `src/tools/device-lab/golden.ts`, re-verified on every `npm run test` by `tests/unit/device-lab.test.ts`, so they stay correct for the build you installed. The build id is shown at the top of the panel so you can confirm what you tested.

## Metrics, thresholds and why

These are **proposals** (the canon has no numbers yet). After the first real runs, adjust and record the final values in the canon (docs 13/14) before locking anything.

| Metric                             | How it is measured                                                                                                                                              | Pass threshold                 | Why this number                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch-to-render p95                | `touchstart` timestamp to the start of the second animation frame after the flash was drawn (an estimate of when the flash reaches the screen), at least 5 taps | <= 50 ms                       | A tap-to-jump or rope fire is the core verb. About 3 frames at 60 Hz is where timing-precision platformers begin to feel soft; typical WebViews achieve 30 to 50 ms, so this separates acceptable from poor. The 240 fps camera is the ground truth |
| Frame time p99                     | rAF deltas over the run, 0.25 ms buckets                                                                                                                        | <= 20 ms                       | At 60 Hz the frame is 16.7 ms; p99 under 20 ms means the worst 1 in 100 frames is less than one frame late. Also valid on 90/120 Hz displays                                                                                                        |
| Long frames                        | share of frames > 33 ms (two missed 60 Hz frames)                                                                                                               | < 0.5 % over 15 min            | A 33 ms hitch is a visible stutter that can cause a missed rope release. Under 0.5 % is about one hitch every 3 seconds at worst; precision platforming should be better, treat 0.1 % as the goal                                                   |
| Sustained fps (thermal throttling) | lowest 60-second average fps across the run                                                                                                                     | >= 55 fps                      | Phones throttle after several minutes; a 15 minute run exposes it. Falling below 55 average means the device cannot hold 60 Hz presentation                                                                                                         |
| Heap growth                        | JS heap after minute 1 to the end (Chromium WebViews only; iOS has no API, use Xcode's memory gauge and note the number)                                        | <= 10 MB                       | The lab allocates almost nothing at steady state, so growth indicates a platform or leak problem; 10 MB leaves room for GC sawtooth                                                                                                                 |
| Audio click latency                | estimated: gesture to scheduling + `baseLatency` + `outputLatency` of the single AudioContext                                                                   | <= 60 ms Android; <= 30 ms iOS | Android audio is structurally slower (AAudio low-latency path is best case about 20 to 40 ms, common devices 40 to 80 ms), iOS Core Audio is reliably under 30 ms. Beyond ~60 ms a rope shot feels disconnected from its sound                      |
| Audio recovery                     | `running` again after returning to foreground                                                                                                                   | <= 2 s                         | The player should hear sound promptly after a call or app switch                                                                                                                                                                                    |
| WebGL restore                      | forced loss to first frame drawn after restore                                                                                                                  | <= 3 s                         | The game must survive context loss without a reload                                                                                                                                                                                                 |
| Determinism                        | GMR-29 replay hashes vs golden                                                                                                                                  | identical                      | Any difference is a blocker: replays, ghosts and leaderboards depend on bit-identical simulation (doc 30 section 5)                                                                                                                                 |

Notes on interpretation: `outputLatency` is reported as 0 or missing on some WebViews (shown as "unknown", counted as 0): treat the click estimate as a lower bound there and prefer the loopback test (play a click, record speaker plus finger tap with the 240 fps camera). Display refresh is estimated from the frame median; on iOS expect 60.

## Results template

Copy this table once per run. One row per device; paste the JSON next to it.

| Device and OS      | Build id | Refresh Hz | Touch p50 / p95 ms | Frame p99 ms | Frames > 33 ms % | Lowest 60 s fps | Heap growth MB | Audio click ms | Audio recovery ms | WebGL restore ms | Determinism | Thermal / notes | Verdict |
| ------------------ | -------- | ---------: | ------------------ | -----------: | ---------------: | --------------: | -------------: | -------------: | ----------------: | ---------------: | ----------- | --------------- | ------- |
| ProMotion iPhone:  |          |            |                    |              |                  |                 |            n/a |                |                   |                  |             |                 |         |
| Older iPhone:      |          |            |                    |              |                  |                 |            n/a |                |                   |                  |             |                 |         |
| Low-end Android:   |          |            |                    |              |                  |                 |                |                |                   |                  |             |                 |         |
| Mid-range Android: |          |            |                    |              |                  |                 |                |                |                   |                  |             |                 |         |

Also record: camera-measured latency (ms, 240 fps), battery drop over the 15 minutes (percent), device temperature feel (cool, warm, hot), and anything odd in the Events log.

## Troubleshooting

- `cap open ios` only works on macOS. On Windows `npm run cap:sync` still prepares both projects.
- Android "SDK location not found": open the project once in Android Studio so it writes `native/android/local.properties` (git-ignored).
- iOS "Untrusted Developer" or Developer Mode missing: see steps 6 and 8 above.
- The lab shows `not measured` for a check until it has data (for example fewer than 5 taps, no audio click, no forced context loss).
- Web inspection: Android `chrome://inspect` (USB debugging); iOS Safari > Develop > your iPhone (enable Settings > Safari > Advanced > Web Inspector).
