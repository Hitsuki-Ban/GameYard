# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside one same-origin iframe at a time.

PulseLinkOverdrive, TUMBLEDRUM, and CrownBreaker are playable exhibits. All three use the same INIT-gated guest contract, Hub-owned public locale/settings, ACKed lifecycle commands, bounded diagnostics, and deterministic cleanup. Their simulations, renderers, input semantics, audio graphs, translations, and game-specific saves remain game-owned. Standalone product builds, per-game Service Workers, legacy public-setting storage, and production mutation surfaces are not part of GameYard. The production Hub owns the only Service Worker: its shell is installed as one exact artifact, while each game becomes available offline only after the player explicitly saves it from the Offline drawer.

The production runtime/build boundary is active:

- Host bridge registers first, navigates a source-free iframe, then performs `gameyard:ready-for-init` → exact `gameyard:init` → one transferred `MessagePort`;
- strict per-game manifest sources, one shared manifest builder, and terminal guest disposal;
- isolated Hub/game stages followed by one transactional site assembly;
- content-derived `gameyard@<16 lowercase hex>` site build IDs;
- one bounded issue-summary envelope and manifest-bound DEV Lab presets;
- one scope-bound Hub PWA with explicit per-game offline saves and visible atomic-update stops;
- structural rejection of stale IDs, undeclared files, collisions, game Service Workers, Lab mutation code, and repository-prefix-breaking URLs.

`site.assembly.json` assembles all three games with the Hub into one exact artifact. `dist/games/catalog.json` registers the same three local exhibits.

## Commands

```powershell
vp install
vp run e2e:install
vp run dev
vp run tooling:test
vp run ready
vp run e2e:lab
vp run e2e
vp run deploy:dry-run
```

All project operations go through `vp`. `vp run build` writes the Hub to an isolated stage, assembles and verifies a fresh `dist`, and fails on any missing required input. Preview verifies that artifact against current sources before serving it; deployment always rebuilds and verifies first.

See `docs/PROJECT_PLAN.md` for the migration order and `docs/DEVELOPMENT.md` for the exact development and validation paths.
