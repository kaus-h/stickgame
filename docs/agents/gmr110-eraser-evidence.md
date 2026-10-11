# GMR-110: completion eraser journey

## Constraints and acceptance

This is post-completion presentation only. Simulation, death/retry, replay hashes, collision and inputs stay unchanged. Empty piles go straight to results. Any key or pointer skips; reduced motion uses the existing 200 ms fade with no camera travel.

A single render timeline moves from the level's left bound to its exit, with smooth start/end easing. Duration scales with distance (2.5–4 seconds for the production levels). The world camera frames the vertical level bounds and follows the eraser horizontally; normal player follow is suspended during the journey. The same world coordinate drives body cropping and faint smudges, so bodies near the start disappear before those at the end.

Open implementation choices are duration calibration and render-only camera framing. No gameplay/canon questions are reopened. Evidence: unit tests for timeline/erasure/cleanup, real-browser monotonic camera travel and ordering, skip/reduced-motion/empty-pile cases, `npm run check`, bundle report. Test results pending.

## Browser evidence

The full body suite passed **33 cases**, with **3 existing opt-in GPU benchmark skips**, across Chromium, Firefox and WebKit (two workers, port 5195, no retries). The 1-3 presentation traverses over 100 m, starts at the left bound, reaches the clamped exit frame, clears body IDs 0, 1 and 2 in order, and then shows results. Keyboard/touch skip, reduced-motion 200 ms fade without camera movement, empty-pile continuation, and real contact death/immediate retry all pass.

Recorded images and timelines: [Chromium](../art/evidence/gmr110/chromium-mid-sweep.png), [Firefox](../art/evidence/gmr110/firefox-mid-sweep.png), [WebKit](../art/evidence/gmr110/webkit-mid-sweep.png). Each browser has a JSON frame timeline in the same directory. These show desktop browser presentation, not physical-device performance.

An initial reduced-motion assertion included Playwright round-trip time; replaced with an in-page observation. An intermediate WebKit assertion expected a frame within 5 px of completion, although the last active frame preceded completion by 9 px; the test now checks the actual finished camera frame. The unit test verifies the exact world endpoint. A review then identified hidden-body crop visibility; the final correction and checks are recorded below.

Final hidden-body regression: failed before the scale visibility guard and passed afterward. Focused layer unit suite: **10 passed**. Final affected browser rerun after this fix: **6 passed** (visibility persistence and complete panorama, all three browsers, 57.2 s). Screenshot/timeline artifacts above were refreshed from this final run.

Required checks pass: **460 unit tests**, 3 existing expected failures, 58 test files; type/schema/layers/lint/format/build green. Fifteen validated levels, zero errors and four existing lab warnings. Bundle budgets unchanged: **252.6/270 KB initial gzip**, **1029.1/1090 KB total**.

Measured 1-3 timeline in all browsers: **3.552 s** duration and **138.33 m** camera travel; erased order **0, 1, 2**. No physical-device or opt-in GPU benchmark claim.
