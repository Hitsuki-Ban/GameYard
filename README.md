# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside one same-origin iframe at a time.

PulseLinkOverdrive and TUMBLEDRUM are playable exhibits. Both use the same INIT-gated guest contract, Hub-owned public locale/settings, ACKed lifecycle commands, bounded diagnostics, fullscreen requests, and deterministic cleanup. Their simulations, renderers, input semantics, audio graphs, translations, and game-specific saves remain game-owned. Standalone product builds, per-game Service Workers, legacy public-setting storage, and production mutation surfaces are not part of GameYard. CrownBreaker is imported at its pinned upstream revision and has a standalone behavior baseline; it remains queued until its Hub adapter is complete.

The production runtime/build boundary is active:

- Host bridge registers first, navigates a source-free iframe, then performs `gameyard:ready-for-init` → exact `gameyard:init` → one transferred `MessagePort`;
- strict game manifests and terminal guest disposal;
- isolated Hub/game stages followed by one transactional site assembly;
- content-derived `gameyard@<16 lowercase hex>` site build IDs;
- structural rejection of stale IDs, undeclared files, collisions, game Service Workers, Lab mutation code, and repository-prefix-breaking URLs.

`site.assembly.json` assembles PulseLinkOverdrive and TUMBLEDRUM with the Hub into one exact artifact. `dist/games/catalog.json` registers those two local exhibits; CrownBreaker remains queued until its migration Issues close.

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
