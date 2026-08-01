# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside one same-origin iframe at a time.

The pinned PulseLinkOverdrive upstream baseline is now preserved under `games/pulse-link-overdrive`. It is intentionally excluded from the public artifact until the next migration slice replaces its standalone boot, settings, storage, and Service Worker path with the GameYard guest adapter. TUMBLEDRUM and CrownBreaker have not been imported.

The production runtime/build boundary is active:

- Host bridge registers first, navigates a source-free iframe, then performs `gameyard:ready-for-init` → exact `gameyard:init` → one transferred `MessagePort`;
- strict game manifests and terminal guest disposal;
- isolated Hub/game stages followed by one transactional site assembly;
- content-derived `gameyard@<16 lowercase hex>` site build IDs;
- structural rejection of stale IDs, undeclared files, collisions, game Service Workers, Lab mutation code, and repository-prefix-breaking URLs.

The current `site.assembly.json` contains no production game, so `dist/games/catalog.json` is deliberately empty until PulseLinkOverdrive is adapted.

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
