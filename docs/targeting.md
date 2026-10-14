# Shared targeting (GMR-118)

Every usable platform anchor attaches at its **centre**, on every input mode and assist tier.
The selected anchor has one shared highlight. There is no extra release cue. The highlight
describes the target of a press; it never fires the rope by itself.

The three gameplay verbs remain Move, Jump and Rope. Run and jump momentum carry into the
swing. An airborne connection locks the player-to-centre distance on the connection tick;
a grounded connection pays out while running and locks that distance on take-off. Releasing
keeps the swing velocity. The rope remains dashed and the simulation remains shared at 60 Hz.

## Input selection

| Input   | How the player selects and presses                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mouse   | The nearest active, unspent anchor within `anchor.radius + rope.selectRadius` of the pointer wins. The PC margin is 1.1 m in content tuning. Press outside every zone is invalid. |
| Gamepad | Right-stick direction points toward an anchor; angular selection chooses the target. RT presses Rope. A neutral stick prefers ahead and above, then falls back to nearest.        |
| Touch   | Mobile Rope defaults to `button`; the Rope button uses the current neutral target or last tap aim. In `tap`, touching the play area aims and presses within radius + 1.8 m.       |

An attachment must be within the 0.8–11 m player-to-centre rope range and visible along an
unobstructed player-to-centre segment. Mouse and tap choose the nearest active, unspent anchor
in the aim zone first, then validate it; a blocked or out-of-range nearest anchor makes the
press invalid rather than falling through to another anchor. Gamepad point and neutral modes
choose from anchors that already pass range and line of sight. Timed and one-use rules remain in
[advanced-anchors.md](advanced-anchors.md). A miss resolves once as an invalid press; holding
the input does not retry automatically.

Mouse, neutral and directional selection use target stickiness to avoid flicker around equal
candidates. The current content values are 12° for directional selection and 0.5 m for
mouse/neutral selection. Tap chooses nearest without hysteresis; button mode latches the last
tapped anchor. These are
tuning values, not new gameplay rules. Touch button and neutral gamepad selection use the
same usable-anchor checks. Mobile setting and query behavior are in
[mobile-controls.md](mobile-controls.md).

## Assist tiers

The saved assist modes are `standard`, `wide-select` and `snap`. Wider selection and snap
tolerances remain explicit choices in content tuning. Each tier attaches at the centre and
uses the same highlight. The tier and input provenance are recorded so playback can reproduce
the selection conditions. Provenance is `mouse`, `pad` or `touch`; missing tags on older
records display as `unknown`. Records share boards across platforms.

## Authoring checks

`npm run levels:validate` warns when two authored PC selection zones overlap. Each zone has
radius `anchor.radius + rope.selectRadius`; the warning reports both centre separation and
the sum of those radii. It is advisory even for v2: close anchors can be intentional, but the
author must review whether the highlight makes selection clear. This static check uses authored
positions; moving-path targeting still needs playtesting.

Required shots tagged with `requiredFrom` are checked against the centre throughout their path,
including range, camera framing and sampled centre line of sight. If the centre fails range or
line of sight while the old disc-edge target passes, validation emits an advisory migration
warning. The original disc-edge gross reach and blocked-shot checks remain fatal. Existing
content can therefore validate while a required shot needs a corrected centre-route tag;
warnings must be reviewed. The validator does not prove that a dynamic route can be completed.

## Constraints and evidence

Locked constraints: shared simulation, three verbs, fixed step, deterministic selection,
centre attachment in every tier, grounded payout, take-off locking, release momentum and
instant retry. Tolerance and stickiness values can be tuned in content; changing rope rules,
adding a verb or adding a release cue is outside this issue.

Acceptance evidence includes focused selection tests for every input mode, overlap-warning
and centre-range/line-of-sight validator tests, deterministic replay checks, and the full local
check. Cross-platform highlight screenshots and physical-device touch evidence are separate
from static validation and unit-test results.
