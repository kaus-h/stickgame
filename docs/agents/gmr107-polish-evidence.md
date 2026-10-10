# GMR-107 follow-up: pool seams and ledge ends

The approved kit renderer landed in PR #51. This separate follow-up preserves its 0014/0015 paper interiors, thin strokes, collision alignment, red-danger semantics, anchor clarity and existing assets. No hero, geometry, simulation, physics, hashes or budgets change.

Bounded choices: mirrored pool repeats to make adjacent joins sample the same ink edge; a short horizontal feather at skirt ends so the existing loose doubled side contours can read without a vertical hatch cutoff. No art canon is reopened.

Acceptance: the pool joins lose their visible bands, ledge skirts fade gently into paper at ends, the existing collision crest/paper/hazard/HMR checks stay green, and `npm run check` plus bundle budgets pass. Produce fresh before/after play and overview screenshots of 1-1, 1-2 and 1-3 in the PR. Results pending.

## Evidence

The final kit/checkpoint suites pass **22 tests**, with **2 expected single-writer HMR skips**, across Chromium/Firefox/WebKit (port 5195, two workers, no retries). Existing crest alignment, paper interiors/hazard gaps, ten HMR resource/fingerprint cycles and Backspace checkpoint reset stay green.

Restoring the old renderer makes the final pixel regression fail at the first pool join: coverage difference **0.02982** against **0.015** maximum. Restoring this polish passes in all browsers. The before renderer also fails the skirt-density fade check. Final seam differences are **0–0.00390**; end hatch density **0.109–0.114** versus **0.340–0.342** nearby; the thin side contour remains measurable at a pencil-ink threshold. Raw numeric evidence is under docs/art/evidence/gmr107-polish.

All **12 fresh before/after screenshots** (1-1/1-2/1-3, play and overview, 1600×900) were captured from the same main base and this renderer with level IDs asserted. No input, geometry, physics, hero, assets or replay goldens change. Timing text can differ between captures.

Luna prepared capture/pixel checks and reviewed clipping/alpha/lifecycle. The first side-contour test used the black hatch threshold; the corrected test measures the deliberately faint contour at a pencil threshold. There is no physical-device/GPU-performance claim.

Required check passes: **457 unit tests**, 3 existing expected failures; type/schema/layers/lint/format/build green. Bundle budgets unchanged: **252.3/270 KB initial gzip**, **1027.9/1090 KB total**. Fifteen levels, zero errors and four existing lab warnings.
