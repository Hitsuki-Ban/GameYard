# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside one same-origin iframe at a time.

Every game admitted by the production registry uses the same INIT-gated guest contract, Hub-owned public locale/settings, ACKed lifecycle commands, bounded diagnostics, and deterministic cleanup. Simulations, renderers, input semantics, audio graphs, translations, and game-specific saves remain game-owned. Standalone product builds, per-game Service Workers, legacy public-setting storage, and production mutation surfaces are not part of GameYard. The production Hub owns the only Service Worker: its shell is installed as one exact artifact, while each current catalog game becomes available offline only after the player explicitly saves it from the Offline drawer.

The production runtime/build boundary is active:

- Host bridge registers first, navigates a source-free iframe, then performs `gameyard:ready-for-init` → exact `gameyard:init` → one transferred `MessagePort`;
- strict per-game manifest sources, one shared manifest builder, and terminal guest disposal;
- one strict, ordered `site.assembly.json` v2 registry joining package, manifest, presentation, development port, stage, and production inputs before dev or build starts;
- isolated Hub/game stages followed by one transactional site assembly;
- content-derived `gameyard@<16 lowercase hex>` site build IDs;
- one bounded issue-summary envelope and manifest-bound DEV Lab presets;
- one scope-bound Hub PWA with explicit per-game offline saves and visible atomic-update stops;
- one CI-built artifact whose digest, static-asset budget report, and source/build/protocol/provenance metadata follow it through host smoke and deployment;
- structural rejection of stale IDs, undeclared files, collisions, game Service Workers, Lab mutation code, and repository-prefix-breaking URLs.

`site.assembly.json` is the only production admission list. Its ordered entries generate the Hub compile-time catalog, development proxies, stages, and final `dist/games/catalog.json`; the workspace never discovers production games by scanning `games/*`.

Public production is served from the same Cloudflare Worker Custom Domain at both [the root exhibition](https://gameyard.hitsuki.space/) and [the repository-style `/GameYard/` path](https://gameyard.hitsuki.space/GameYard/). The prefix route strips exactly that public mount before reading the same immutable static-asset binding; it is not a second build or deployment. The production Worker has no `workers.dev` endpoint.

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

All project operations go through `vp`. `vp run build` writes the Hub to an isolated stage, assembles and verifies a fresh `dist`, and fails on any missing required input. Preview verifies that artifact against current sources before serving it. Deployment accepts only an already verified artifact and never rebuilds it.

GitHub Actions generates its game matrix from the strict registry, runs shared checks once and each registered workspace baseline independently, then builds and uploads the site, deployment entry, bound provenance records, and source-artifact size report exactly once. Root/repository-prefix PWA smoke, the Windows visual/localization/switch/accessibility release gate, Cloudflare dry-run, and production deploy all download and re-verify that artifact without rebuilding. A tagged release additionally publishes the original GitHub Actions ZIP only after its SHA-256 matches the immutable artifact digest and the deployed root/prefix URLs pass live smoke.

See `docs/PROJECT_PLAN.md` for architecture and migration history, `docs/DEVELOPMENT.md` for development/diagnostics/deployment paths, `docs/UPSTREAM_AUDIT.md` plus `provenance/` for source rights, and [GitHub Releases](https://github.com/Hitsuki-Ban/GameYard/releases) for verified public artifacts.
