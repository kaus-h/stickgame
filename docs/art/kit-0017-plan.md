# GMR-112: kit 0017 integration

Baseline: fresh branch from main `9a3c767`, including merged GMR-111. Canon: GMR-112 brief and Linear doc 07B translation/checklist.

Locked: render-only art aligned to existing authored collision; no simulation, level geometry, golden or budget changes. Thin notebook ink, paper majority, red confined to hazards. Terrain hatching approximately 30% lighter than approved sheet A. Pool banks use sheet A rock, not sheet B cobblestone. Existing spike/anchor/exit art remains; T24 and T29–T33 are outside scope.

Bounded implementation: mechanically slice the two approved sheets with transparent paper; record source/crop/contact guides and provenance for every asset. Select terrain stamps using GMR-111 edge topology, bake into existing world tiles, preserve contact contours and suppress shared seams. Default to 0017, with `?kit=0016` retaining the old renderer. Three faint screen-bounded scenery layers tile horizontally behind terrain, at increasing parallax; reduced motion disables parallax. Existing notebook ruling is unchanged.

Acceptance evidence: all three Section 1 levels in play and overview, before/after screenshots under `docs/art/evidence/gmr-kit0017/`; calibrated contact-line pixel tests, fallback and reduced-motion/resource checks; unchanged level fingerprints/replay hashes; full repository check and bundle report. PR lists T-id selection and use. Physical-device art acceptance remains for owner review.
