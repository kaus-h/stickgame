# Compartment exits (GMR-46)

## Constraints and acceptance

Canon: Linear GMR-46 and doc 06 §5. Move, Jump and Rope remain the only verbs; rope
length/release momentum, fixed 60 Hz deterministic simulation and shared mobile simulation
stay unchanged. Death resets immediately in the same world with no interstitial UI. Only a
successful exit can show results. Checkpoints, moving hatches and later exit families remain
outside this issue. Acceptance: wide, horizontal slot and vertical shaft entries accept/reject
their authored angle, speed and alignment windows reliably, including high-speed crossings;
misses have readable spatial feedback and structured telemetry.

## Design and implementation plan

1. A v2 authored exit has `id`, `family` (`wide`, `slot`, `shaft`), `min`/`max` region and
   `entry`: `side` (`left`, `right`, `top`, `bottom`), `angle` degrees `{min,max}`, `speed`
   m/s `{min,max}`, and normalized opening `alignment` `{min,max}`. Angle is unsigned deviation
   from the inward normal, 0° straight in and 90° grazing. Alignment increases down vertical
   openings and right across horizontal openings. Windows are inclusive. Slots enter from
   left/right; shafts from top/bottom; wide compartments support any side. All thresholds are
   authored tuning, not new locked canon. Existing bare box exits stay compatibility exits.
2. Pure simulation geometry sweeps physics motion segments against entry
   boundaries instead of testing only the final tick position. The circle must fit the aperture.
   Use deterministic cosine/dot comparisons for angle, and record the crossing position,
   arrival velocity, speed, alignment and reason. Hazard/death processing takes priority over exit
   success on the same tick. Rejects leave motion untouched and allow re-entry after leaving.
3. One accepted entry records completion exactly once and holds the finished attempt for results.
   The existing restart intent clears completion/miss state and instantly restores spawn. Death
   never creates a completion screen. Hot reload also clears this state. Record last miss plus
   exit/exit-miss events with stable authored exit IDs; expose both in the debug overlay.
4. Render compartment boundaries, opening, inward arrow and the authored guidance in the paper
   style, with a brief marker at a rejected crossing explaining the rule. Render results only
   from accepted completion, using the existing restart binding. Keep feedback in render and
   authoritative rules in sim. No new gameplay button or verb.
5. Extend JSON Schema/compiler/validator for the new v2 contract, regenerate its standalone
   validator, and add a lab per family. Reject reversed windows, incompatible family/side,
   blocked/impossible openings, and missing stable IDs. Keep all existing v1 levels loading.
6. Evidence: pure acceptance boundary/high-speed tests, integrated sim success/miss/death/reset
   tests, v2 schema invalid-input tests, browser tests for each family and post-success results,
   unchanged legacy replays, layer/determinism checks, bundle budget, and full `npm run check`.

## Practical limits

The production kinematic adapter reports sweep segments and their velocity before a later
collision can change the arrival measurement. When the rope constraint is satisfied, provisional
movement is clipped to the current pivot's leash so rope correction cannot count an unreachable
entry. Collision-wins motion remains unchanged. Backends without motion reporting use a fixed-tick
chord with pre-step velocity; candidate-backend exact entry feel remains unverified.
Collision remains authored in solids and resolved by PhysicsAdapter. Entry rules describe arrival at the
opening, not a full traversal/playability proof. Lab thresholds need human feel and native-device
review before production tuning is locked.

Labs: `lab-exit-wide` and `lab-exit-slot` accept running right; `lab-exit-shaft` accepts running
off the ledge into its top opening (20–28 m/s total-speed window). `lab-exit-miss` demonstrates
a speed rejection, readable crossing marker, then instant death/retry after running off its floor.
The miss lab is intentionally a feedback fixture, not a production route.
