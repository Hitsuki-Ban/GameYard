# Asset manifest

TUMBLEDRUM has no external runtime asset dependency.

## Visuals

All visible game art is drawn at runtime with Canvas 2D primitives and seeded procedural irregularity. The project does not embed stock images, generated raster art, icon libraries, external SVG packs, or font files.

Locale-aware system font stacks:

- English: Georgia, Times New Roman, Times, generic serif.
- Japanese: Yu Mincho, YuMincho, Hiragino Mincho ProN, Noto Serif JP, Georgia, generic serif.
- Simplified Chinese: Noto Serif CJK SC, Source Han Serif SC, Songti SC, STSong, SimSun, Georgia, generic serif.

## Audio

All sound effects and the adaptive percussion bed are synthesized at runtime with WebAudio oscillators, noise buffers, filters, envelopes, and gain staging. No recorded sample or music file is included.

## Data

Stage layouts, upgrades, palettes, and endless-generation rules are authored in `src/content.js`. UI rendering and glyphs are authored in `src/game.js`. Japanese, Simplified Chinese, and English interface catalogs and locale policy are authored in `src/i18n.js`.

## Network

The Pages build uses only repository-relative files. `TUMBLEDRUM_PLAY.html` contains inline CSS and JavaScript and makes no network request during normal play.
