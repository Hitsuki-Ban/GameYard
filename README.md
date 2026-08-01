# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside one same-origin iframe at a time.

PulseLinkOverdrive is the first playable exhibit. Its pinned simulation baseline remains intact while a GameYard guest adapter now owns INIT-gated startup, Hub settings and locale mapping, lifecycle commands, bounded diagnostics, fullscreen requests, and terminal cleanup. The old standalone build, game Service Worker, install manifests, public-setting storage, and production mutation surface are not part of the product. TUMBLEDRUM is imported at its pinned revision with its original standalone baseline, but remains outside the production assembly until its adapter Issue closes; CrownBreaker has not been imported.

The production runtime/build boundary is active:

- Host bridge registers first, navigates a source-free iframe, then performs `gameyard:ready-for-init` → exact `gameyard:init` → one transferred `MessagePort`;
- strict game manifests and terminal guest disposal;
- isolated Hub/game stages followed by one transactional site assembly;
- content-derived `gameyard@<16 lowercase hex>` site build IDs;
- structural rejection of stale IDs, undeclared files, collisions, game Service Workers, Lab mutation code, and repository-prefix-breaking URLs.

`site.assembly.json` currently assembles PulseLinkOverdrive with the Hub into one exact artifact. `dist/games/catalog.json` registers that one local exhibit; later games remain queued in the editorial index until their own migration Issues close.

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
