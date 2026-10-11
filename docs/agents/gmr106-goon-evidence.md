# GMR-106: deterministic goon browser test

## Scope and constraints

The tether portion landed in PR #50. This follow-up covers the moving-goon stomp test handed to Codex in GMR-106's comments. Gameplay, level geometry, simulation, replay goldens, and production input behavior stay unchanged. The only runtime-side adjustment is in the dev-only readiness hook: it now reports zero cameras while the dev scene is not yet created, instead of dereferencing the absent scene. This makes the browser readiness check safe during startup and does not change production input or rendering. The open implementation choice is how the test observes the brief rebound and rope windows. Acceptance is 20 repeated runs per browser, the repository checks, and a separate unmerged PR to main.

## Route and observation

The test uses the existing `playReplay` dev hook and the route already proved in `tests/unit/enemy-replay.test.ts`: move at tick 0, stomp at tick 39, attach to (11, 2) at tick 57, release at tick 67, restart at tick 120. Inputs are scheduled on simulation ticks. An in-page animation-frame observer captures the brief states without successive Playwright round trips; the 10-tick rope window is longer than the runtime's five-step frame cap. Release evidence includes the exact pre-step velocity. The test checks a successful rebound, correct attachment, preserved release momentum, no deaths, enemy restoration and unchanged Phaser texture/camera counts. Each run attaches its captured evidence as JSON.

## Previous hang

The earlier conversion in commit `c4185ed` referenced Node-side `STOMP_AT`, `ATTACH_AT`, `RELEASE_AT` and `RESET_AT` inside a serialized `page.evaluate` callback, but passed only the replay string. Playwright does not capture those lexical values. Its first animation-frame callback threw `ReferenceError`, leaving the outer Promise pending until the 60-second test timeout. That change was reverted by `a12d630`.

This conversion passes every timing value explicitly across the browser boundary, catches observer exceptions and rejects, and cancels observation/replay on every completion path. A 20-second watchdog reports the last relative tick if rendering stops. The converted test uses the same 60-second total browser-fixture budget as the existing tether replay test; the replay observer retains its independent 20-second watchdog. The unsafe-contact test retains its existing 30-second budget. The separate unsafe-contact browser test and the tolerant real keyboard/mouse test in `tether.spec.ts` retain their DOM-input coverage.

## Verification

From main `57b2741`, with an owned dependency install, browser binaries at `D:\ms-playwright`, temporary port-5195 config, and two workers:

```sh
npx playwright test --config playwright.gmr106.config.ts --workers=2 tests/e2e/goon.spec.ts --grep 'a moving goon' --repeat-each=20
```

Initial repeat proof: **60 passed** (20 Chromium, 20 Firefox, 20 WebKit), no retries. The temporary config is not committed. An initial single pass of the full goon file passed the converted test on all browsers; the unchanged unsafe-contact test exceeded its 30-second timeout in Chromium while polling its death cause. Its Firefox/WebKit runs passed. This initial 60/60 result predates the later dev-only readiness-hook adjustment.

An intermediate repeat before the readiness-hook adjustment completed **56/60**: two Firefox cases passed all test assertions but failed during `browserContext.close` with Firefox's internal `Browser.removeBrowserContext` error (`_maybeDontRestoreTabs` / missing window entry); two WebKit cases failed the camera-readiness check before replay because the dev scene had not yet been created. The WebKit failures led to the dev-only null-safe readiness adjustment described above. The final rerun including the readiness fix passed **60/60** (20 Chromium, 20 Firefox, 20 WebKit) in 4.9 minutes, with no retries. Gameplay route inputs, tick assertions, production input, and the independent observer deadline remain unchanged.

Final full goon-file regression: **6 passed** across all three browsers (51.4 seconds), including the unchanged unsafe-contact case. Required repository checks: **442 unit tests passed**, 3 existing expected failures, 15 validated levels. Bundle: **242.2/270 KB initial gzip**, **973.1/1090 KB total**; budgets unchanged.
