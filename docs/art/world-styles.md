# World styles (GMR-120)

Levels may author `world: { "family": "notebook", "subTheme": "..." }`. Omitting
`world` defaults to `{ "family": "notebook" }`. Family and optional sub-theme
must be non-empty strings; unrecognized names are valid authoring metadata.
`getLevelWorld(level)` retrieves this immutable metadata from content. It stays
outside simulation state, physics, replay hashes and collision geometry.
The debug overlay displays `world <family>/<subTheme or ->`.

## Registry contract

`src/render/world/WorldStyle.ts` registers only `notebook`. To add a family,
register a `WorldStyle` under its family name. To add a sub-theme, register it
under `family/subTheme`, with its own unique style id. `resolveWorldStyle(level)`
tries that sub-theme key, then its family, then notebook. Unknown metadata therefore
keeps rendering with approved notebook tokens.

Each style supplies paper base, fibre and rule colours, margin and binding
hole/wire/highlight colours; ink and pencil colours; terrain border ink;
hatch density; lamp centre and pool/gutter/fall gradient stops; terrain kit key;
background key; motes enabled; and an optional music bank id. Hatch density is a
positive multiplier (notebook is 1): terrain hatch spacing divides by it.
Border ink preserves the existing Canvas black separately from notebook ink.
Shared paper, lamp and border textures use style-specific keys so switching worlds
does not reuse another world's baked tokens. Preserve ids for stable cache identity.

GameScene resolves the style and passes it to paper, frame, doodles, draw-in,
lamp and LevelKit. It gates motes with the style switch. LevelKit passes terrain
ink and density to its terrain and border drawing. The current supported terrain
kits are `0016` and `0017` (notebook defaults to `0017`); existing `?kit=0016`
and `?kit=0017` overrides remain available. Both supported kits are decoded at boot to keep level changes synchronous.
New terrain kit keys require loaders and painters. Background key `kit17` selects today's strips under the existing
high-contrast and kit gates; other background keys require an implementation.
Living-notebook timing, motion and drawing algorithms are unchanged.

## Music bank resolution

The app composition root passes the resolved style's optional `musicBankId` to
MusicDirector on construction and every level replacement. Audio does not import
render. A supplied id overrides section selection; absence selects `section-2`
only for section-2 levels, otherwise `section-1`. Replacing a level clears the
previous override if the next style does not specify one. Notebook leaves the id
unset, preserving all existing section music and synthesis. New bank ids also
need a corresponding bank in the audio engine.

Art is pending the owner's concept picks. Notebook, cut paper, painterly, neon
ink and digital are possible world directions, not approved assets or registered
families. This task introduces metadata and token plumbing only.
