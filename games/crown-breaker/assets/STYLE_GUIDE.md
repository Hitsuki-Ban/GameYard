# CROWN//BREAKER Art Asset Guide

## Chosen direction

The release asset package follows **Deco Court**: a compact neon-court language built from stepped palace geometry, jewel facets, fan-shaped rays, and deliberate fractured cuts on enemy silhouettes. It keeps the game's cyan / gold / magenta identity while remaining legible as monochrome geometry.

On 2026-07-21, three independent raster direction sheets were generated with `imagegen` and compared before vector production:

| Direction | Resolution | SHA-256 | Decision |
|---|---:|---|---|
| A — Razor Heraldry | 1672 × 941 | `1FDFF3F83B8756ED17BE2A973C893E6D186045982FBB5D1FA8DC1F10B0C8D5B6` | Comparison only |
| B — Deco Court | 1672 × 941 | `D55E3E65BDDA6856CC9FD98F610DC86C5B7D141A45002DA10A2D3C1D9DDF48AE` | **Selected** |
| C — Spectral Usurpation | 1672 × 941 | `85AB8B3296A7A420D0A51522F4543C9E067FBD351E3A0C6F4EC7699211C4FF53` | Comparison only |

The three concept sheets were visual references for comparison and are not part of the published package. Final SVGs were drawn originally for this project from the selected design principles; no external source artwork is embedded or redistributed. The final repository assets are distributed under the repository's MIT license. This statement does not make a separate copyright claim about the image-generation service or its output.

## Simplification rules

- Preserve the stepped court arches, faceted jewels, broad fan rays, and enemy-side fracture notches.
- Remove fine filigree, portraits, tiny inset ornament, and any detail that collapses at 16 px.
- Judge every combat glyph at 16 px before accepting detail visible only at large sizes.
- Use silhouette and negative space for meaning; color adds hierarchy but never carries side identity alone.
- Player pieces use a continuous body and double base. Enemy pieces use asymmetric cuts, notches, and a harder single-base rhythm.

## Inventory and naming

The package contains 50 source SVGs:

- `pieces/`: 12 files named `{white|black}-{king|queen|rook|bishop|knight|pawn}.svg`.
- `bosses/`: `twin-queens.svg`, `iron-bastion.svg`, and `pawnstorm.svg`.
- `traits/`: all 15 current trait IDs — `guarded`, `phantom`, `chains`, `hex`, `summoner`, `thorns`, `tithe`, `mist`, `berserk`, `rampart`, `swift`, `echo`, `gravity`, `possession`, `lockstep`.
- `formations/`: `scatter`, `phalanx`, `pincer`, `fortress`, `vanguard`, and `lance`.
- `acts/`: three background plates plus a three-fragment particle sheet for each of `outer`, `gallery`, and `throne`.
- `ui/`: `turns`, `shield`, `crown`, `combo`, `energy`, and `relic`.
- `brand/`: horizontal `logo.svg` and maskable-source `app-icon.svg`.

File names and IDs are canonical. Consumers should report a missing or unknown asset rather than substitute another icon.

## Geometry contract

| Asset family | viewBox | Primary use |
|---|---:|---|
| Pieces | `0 0 100 100` | Board silhouettes; tested at 100 / 48 / 24 / 16 px |
| Boss crowns | `0 0 120 120` | Route and battle crown targets |
| Traits | `0 0 24 24` | Route rules and battle status |
| Formations | `0 0 24 24` | Contract deployment preview |
| Act backgrounds | `0 0 1920 1080` | Outer / gallery / throne atmosphere layers |
| Act particles | `0 0 96 32` | Three reusable fragments per act |
| HUD | `0 0 16 16` | Turns, shield, crown HP, combo, energy, relic |
| Logo | `0 0 600 100` | Horizontal identity lockup |
| App icon source | `0 0 100 100` | Maskable PWA export; every visible core pixel stays within the central 80% safe circle |

## Color contract

SVG source geometry uses only `currentColor`, `none`, and these host-supplied custom properties:

- `--asset-background`: surrounding field, normally `#07050d` in raster exports.
- `--asset-primary`: player / interactive emphasis, normally cyan.
- `--asset-accent`: crown / reward emphasis, normally gold.

Set `color` on the host element for single-ink assets. Hard-coded color values do not belong inside the source SVGs. The contact sheet intentionally includes a same-ink player/enemy comparison to verify that the two sides remain distinguishable without hue.

## Validation and export contract

- Release SVGs use a strict element allowlist (`svg`, `title`, `g`, `path`, `circle`) and a strict attribute allowlist. Namespace prefixes, animation, links, active content, embedded resources, declarations, comments, and unknown attributes fail validation.
- Each SVG is limited to 64 KiB, 256 elements, and 32 KiB of path data before any renderer receives it.
- The preview repeats the same namespace-aware allowlist in the browser and runs under a CSP with external same-origin scripts only.
- The maskable core is rasterized at 400 × 400 and every visible pixel must remain within radius 40% of the canvas. The contact sheet overlays that real 80% circle on the unscaled source and shows a separate circular-mask preview.
- `pnpm build:assets` uses ImageMagick with explicit memory, map, disk, area, dimension, time, process-timeout, and output-buffer limits. Missing ImageMagick fails the command; no alternate exporter is selected silently.
- The colored 192 / 512 PNG exports are the canonical installed-app and favicon surfaces. `icon.svg` remains a transparent, token-compliant monochrome derivative for adaptable consumers, not the default external browser icon.

## Delivery boundary

This package supplies source artwork, deterministic export/check commands, the PWA icon source, and a hosted contact sheet. Replacing the current Canvas / Unicode game renderer is a separate integration task, as specified by Issue #5; the asset package does not silently change runtime rendering.
