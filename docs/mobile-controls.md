# Mobile landscape controls (GMR-118)

The game uses the same fixed 60 Hz simulation and centre attachment as mouse and gamepad.
Move, Jump and Rope remain the only gameplay verbs. Hold Rope to tether; lift to release with
the swing velocity intact. A press resolves once, including a miss; holding never retries a shot.
The current shared targeting rules are in [targeting.md](targeting.md).

## Rope setting

**Mobile Rope** is saved locally in Settings as `touchRope: 'button' | 'tap'`.
Its default is `button`. The query `?touchRope=button|tap` overrides the setting for testing.

| Setting  | Aiming and pressing                                                                                                 | Release                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `button` | Hold the Rope button to press at the current neutral target or the last play-area tap. A play-area tap updates aim. | Lifting the Rope-button finger releases. |
| `tap`    | Touch the play area to aim and press together. Choose the nearest active, unspent anchor within its radius + 1.8 m. | Lifting the rope finger releases.        |

Tap tolerance lives in content tuning. Both modes require centre range and clear line of sight.
Tap validates the nearest chosen anchor after selection; a blocked or out-of-range choice is
an invalid press. Tap has no target hysteresis. Button mode latches the last tapped anchor.
The current target has the same highlight used on desktop and gamepad; tap mode provides no
separate release cue. Button mode uses the shared neutral selection when no tap aim is present:
ahead and above first, then the nearest usable anchor if none meets that preference.

Every pointer id is tracked independently, so move, jump and rope can overlap. Pointer cancel,
window blur and the page becoming hidden release held controls. Changing the rope or move
setting during a hold releases it and ignores the old fingers until they lift.

## Move and layout

`digital` move is the default: the bottom-left move zone is split between left and right, so
the thumb can rock across without lifting. `analog` provides a fixed stick with a dead zone
and quantised movement. Jump is held independently on the right.

Controls are sized in CSS pixels and placed inside the safe-area insets. They appear on the
first touch or with `?touch=1`. Mouse and pen retain the mouse mapper; touch pointers use the
touch mapper. Other game query options include `?move=digital|analog`, `?touchScale=1.2` and
`?assist=standard|wide-select|snap`.

## Assist tiers and records

Standard, wide select and snap remain explicit settings. Their tolerance settings do not move
the attachment away from the centre, alter rope length, or change release momentum. They share
one target highlight. The assist tier is recorded for reproducible playback; input provenance
uses `mouse`, `pad` or `touch`. Older records with no input tag are shown as `unknown` and remain
valid on the shared boards. There are no platform-specific leaderboards.

## Physical-device evidence

Physical-device validation should check button and tap on small and large phones, including a notched device,
with move, jump and rope held together. Measure acquisition time, misses, accidental presses,
finger occlusion and two-thumb comfort. Check cancels, blur, setting switches and safe-area
placement. Desktop emulation does not establish physical-device comfort.

`/touch-lab.html` remains a separate prototype acquisition lab. Its GMR-27 scheme controls
(`direct-touch`, `reticle-offset`, `drag-aim`) and exported scheme metrics describe that lab;
they are not the game's Mobile Rope setting. Keep legacy lab exports identified by their scheme
and build rather than treating them as button/tap evidence.
