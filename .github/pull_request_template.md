## Linear issue

GMR-

## What changed and why

## Evidence

<!-- Numbers, screenshots, replay links, test output. Say what you did NOT verify. -->

## Checklist

- [ ] Matches the Linear issue's acceptance criteria
- [ ] No locked canon changed; no open question promoted to final without evidence
- [ ] Gameplay reads semantic intents only (no raw device events in sim)
- [ ] Physics only through the PhysicsAdapter
- [ ] Reset/cleanup tested (no growth in bodies, joints, listeners)
- [ ] Frame-rate independence considered (fixed step)
- [ ] Camera/world-space mapping considered
- [ ] Mobile implications considered
- [ ] New state visible in the debug overlay
- [ ] Art matches collision; asset provenance recorded; no copied reference art
- [ ] Failure stays diagnosable and retry stays instant
- [ ] `npm run check` passes
- [ ] Reviewed by the other agent
