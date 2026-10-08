# Mobile landscape controls (GMR-27)

Status: **prototype**. Three control candidates run against the shared simulation, plus a touch lab
for measuring them on phones. Nothing here is device-validated; the evaluation on physical devices
is GMR-33. The recommendation at the end is preliminary and based on desktop emulation only.

## Constraints these candidates respect

- Three verbs only: Move, Jump, Rope. Aim is part of Rope. The only extra buttons are pause and
  restart (UI, not verbs).
- Same simulation on every platform: `src/input/TouchInputMapper.ts` produces the existing
  `Intent`s (`move`, `jumpPress`/`jumpRelease`, `ropeAim`, `ropePress`/`ropeRelease`, `restart`,
  `pause`). `src/sim` has no idea which scheme or device is in use.
- Hold-to-tether everywhere: touch-down presses the rope, lift releases it, release keeps the
  velocity. A press resolves once (the sim never retries while held), so no scheme auto-fires.
- No auto-targeting in standard mode. Assists are explicit, opt-in and drawn (see below).

## The candidates

All three share the same move and jump controls and run multi-touch: every pointer id is tracked
independently, so move, jump and rope overlap freely. Pointer cancel is treated as a lift; window
blur or the page being hidden releases everything; a scheme or move-style switch mid-hold releases
every held verb and ignores the old fingers until they lift.

| Scheme           | Rope                                                                                                                                           | Aim point                                                                                                                                                                                                                                                                                         | Finger over target                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `direct-touch`   | Touch-and-hold anywhere in the play area: press on touch-down, release on lift. One rope finger at a time; extra play-area touches do nothing. | The touch point (re-projected every tick, like the mouse).                                                                                                                                                                                                                                        | Always (the finger is the aim).   |
| `reticle-offset` | As direct-touch.                                                                                                                               | `reticleOffset` CSS px (default 64, × control scale) above the finger; a reticle and a dotted leader follow the finger.                                                                                                                                                                           | No, by construction.              |
| `drag-aim`       | A rope button on the right, left of jump. Plain hold-to-tether: touch-down on it presses at the reticle, lift releases.                        | A persistent screen-space reticle (a virtual mouse cursor, re-projected every tick). Dragging anywhere in the play area moves it by finger delta × `dragGain` (default 1.6) without touching the rope. Dragging the rope-button finger also moves it, so the next shot can be lined up mid-swing. | No: the thumbs stay on the edges. |

Why this drag-aim rule: a drag that starts on the rope button and fires on lift would break
hold-to-tether (lift must release), and firing when the reticle crosses an anchor would be an
auto-fire assist. Separating "aim" (drag on the play area) from "tether" (hold the rope button)
keeps the press a single, deliberate, zero-latency action. Cost: aiming and tethering are two
gestures, and the right thumb must move between the play area and the rope button.

Move: `digital` (default) is two left/right zones; the whole bottom-left move zone steers, split
between the two buttons, so the thumb can rock across without lifting. `analog` is a fixed stick
with a dead zone (default 0.18 of its radius) and the axis quantised to 1/20.

Layout: base unit = 12 % of the short side, clamped to 40–76 CSS px, × `scale`. Controls are
pushed in by the safe-area insets (`env(safe-area-inset-*)`, mapped to `--safe-*` CSS variables in
`index.html` and read by the app through a padded probe element, since `getComputedStyle` does
not resolve custom properties). Unit tests check that every control stays inside the safe area and
that no two drawn controls overlap at 844×390 and 800×360 with notch-sized insets.

Overlay: `src/render/TouchControlsView.ts` draws the controls in notebook ink (pencil when idle, a
highlighter swipe and black ink when pressed), at 1:1 CSS px whatever the camera zoom. It is fed a
plain state object by the app; render never imports input. Hidden on non-touch devices; shown on
the first touch or with `?touch=1`. Mouse and pen keep driving the desktop mapper; touch pointers
go only to the touch mapper.

URL options (game): `?touch=1`, `?scheme=direct-touch|drag-aim|reticle-offset`,
`?move=digital|analog`, `?touchScale=1.2`, `?assist=standard|wide-select|snap`.

## Assist tiers

`AssistMode` (`src/core/assist.ts`) is passed explicitly to the simulation
(`new Simulation(..., { assist })`, `GameRuntimeDeps.assist`). Radii live in
`content/tuning/runtime.json` → `assist` (PROTOTYPE REQUIRED, set them on devices).

| Tier          | Rule (`resolveTarget`)                                                                                                   | Visible as                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `standard`    | Canonical selection with `rope.selectRadius` (1.1 m). The assist radii are ignored; results are bit-identical to before. | The normal selection highlight.                                                                                                            |
| `wide-select` | Selection radius `max(selectRadius, wideSelectRadius)` (1.8 m).                                                          | The normal selection highlight (selection is always drawn).                                                                                |
| `snap`        | If nothing is within `selectRadius`, the nearest anchor within `snapRadius` (2.6 m) is selected and flagged `snapped`.   | A highlighter swipe and a dashed ink line from the aim to the snapped impact point, every frame it applies. Debug overlay shows `SNAPPED`. |

The impact point is still the nearest point on the anchor's disc to the aim (the rope length is
still measured, never centre-snapped). The tier is part of a run's identity: `Replay.assist`
records it (omitted for standard, so existing payloads are unchanged) and playback must use the
same tier. The snapshot carries `assist`; the debug overlay prints it.

## Touch lab

`/touch-lab.html` (shipped with every build, separate from the game bundle; no Phaser). It runs a
seeded target-acquisition test with the real touch mapper, the game's selection rule and assist
tier, and the game's camera scale for the viewport.

Run it on a phone:

1. Dev server reachable from the phone: `npx vite --host` (same Wi-Fi), open
   `http://<pc-ip>:5173/touch-lab.html`; or open `/touch-lab.html` on a PR preview deploy; or load
   it in the Capacitor shell.
2. Hold landscape. Pick scheme, move style, assist, trials (default 20) and seed (default 27; keep
   it fixed across devices so everyone sees the same targets). Press Start.
3. Hit each red-ringed anchor with the rope (decoy anchors are on screen too). Optionally hold
   move while aiming to measure overlap.
4. After the run the summary appears; Export JSON downloads the file (also shown in the text box
   for copy-paste where downloads are awkward).

URL presets: `?scheme=drag-aim&move=analog&assist=snap&trials=20&seed=27`; `?mouse=1` lets a
desktop mouse act as one touch (sanity checks only, never data).

Metrics per trial and per run:

- acquisition time: target shown → first press that selects it (ms; median and p90 per run);
- selection error: aim point → target centre, metres and CSS px, every press;
- misses: presses that selected nothing or a decoy (miss rate = misses / presses); trials time
  out after 6 s;
- occlusion: a finger was within `finger px` (default 24 CSS px, about 4 mm) of the target centre
  at press time;
- snap rate: presses selected by the snap assist;
- overlap rate: presses made while a move finger was held.

The export carries build hash, user agent, viewport, device pixel ratio, safe-area insets, coarse
pointer and max touch points, the camera scale, assist radii and selectRadius.

## Evaluation plan (GMR-33, physical devices)

Devices: at least one small Android (~6.1"), one large Android, one notched iPhone, one tablet;
browser and Capacitor shell. Players: at least 5, including one who has never played.

For each scheme × {digital, analog} × {standard, wide-select, snap}, seed 27, 20 trials, two
repetitions in counterbalanced order:

1. Acquisition: median/p90 acquisition time, mean error (px and mm), miss rate.
2. Occlusion: occlusion rate, plus "could you see the target when you pressed?" (1–5).
3. Overlap: repeat with move held; compare against the move-free run (time and miss rate).
4. Two-thumb reach and comfort: in the game (lab-01, lab-moving), five minutes per scheme; record
   reach failures (thumb can't reach the rope button / far play area without regripping), comfort
   (1–5) and fatigue; photograph the grip. Check every control against notch, rounded corners and
   the gesture bar with real insets.
5. Moving anchors: lab-moving attempts and success rate per scheme (the lab only has static
   targets).
6. Accidental input: OS edge gestures, palm touches, touch cancels during play (count).

Decision rule (proposed): pick the scheme with the lowest p90 acquisition time and miss rate in
standard mode, unless its comfort or occlusion score is clearly worse; assists stay opt-in and are
tuned so `snap` rarely fires for players who are already accurate.

## Preliminary recommendation (desktop emulation only, NOT device-validated)

Evidence available now comes from emulation (Playwright touch, synthetic and CDP multi-touch) and
geometry, not from human thumbs:

- All three schemes produce the same intents and pass the overlap, cancel, blur and mid-hold
  switch tests; a scripted touch run (move zone, jump, touch-and-hold on the anchor) tethers in
  lab-01 in Chromium, Firefox and WebKit at 844×390 and 800×360.
- The standard selection disc is generous at phone scale: (0.4 m radius + 1.1 m selectRadius) ×
  32.5 px/m = about 49 CSS px at 844×390 (45 px at 800×360), roughly 7–8 mm on a phone. Typical
  touch-point error is a few millimetres, so static targets should not need an assist; the open
  risk is occlusion and moving targets, not the selection radius.
- `direct-touch` occludes the target on every press by construction (the finger is the aim);
  `reticle-offset` and `drag-aim` do not.
- `drag-aim` needs two gestures per shot (aim, then hold) and the right thumb must travel between
  play area and rope button, which is likely slower for fast chains, though it allows lining up
  the next anchor mid-swing.

Preliminary pick: **`reticle-offset` with digital move and standard assist** as the default
candidate to validate first (one gesture, zero-latency press, no occlusion), with `direct-touch`
as the baseline to beat and `drag-aim` kept as the precision/accessibility alternative. Treat this
as a hypothesis for GMR-33, not a decision.

## Open questions

- Reticle offset: fixed 64 px, scaled by control scale, or per-device? Does an offset aim feel
  wrong near the top edge (the aim clamps to the screen)?
- The bottom-left move zone and bottom-right jump cover the lower ~25 % of the screen, where
  floors and hazards are drawn. Should the camera reserve a bottom band on touch (a render-only
  framing change), or should controls fade while idle?
- In `direct-touch` / `reticle-offset` the bottom-left move zone cannot be used to aim; anchors
  there are unreachable by touch until the camera moves. Acceptable?
- Should a second play-area finger in `direct-touch` be able to take over the rope (re-shoot) after
  the first lifts, or is ignoring it right?
- Is a persistent screen-space reticle (drag-aim) the right model, or should it be anchored to the
  player or the world?
- Pause currently emits the `pause` intent, which the sim ignores (no pause UI yet).
- Pre-existing, outside GMR-27: the HUD timer and level title are drawn with scroll factor 0 but
  still scale with camera zoom, so on phone viewports they are small and off their anchors. The
  touch overlay compensates for zoom; the HUD does not yet.
