# Handoff

- source: Codex task `019fbbb1-910c-7652-9cb5-f27d8150dd88`, 2026-08-01
- repo: `F:\WorkSpace\GameYard` | branch `main` | HEAD unborn (no commit) | clean: no; initialized files are untracked | remote: none
- goal: Ship M1 PulseLinkOverdrive as the first same-origin iframe slice, with upstream behavior retained and the v1 bridge/settings lifecycle passing root, prefix, and repeated enter/exit gates.
- verified: `vp run ready` -> 21 tooling fixtures + 37 unit/contract + check + build + artifact gate passed; `vp run e2e:lab` -> 1/1 passed; `vp run e2e` -> 15/15 passed; `vp run deploy:dry-run` -> 4 static assets accepted @ unborn HEAD
- done-this-thread:
  - Audited all three pinned upstream revisions; provenance and the TUMBLEDRUM license gate are recorded.
  - Initialized the exact Vite+ / pnpm / Node workspace, React Hub, strict settings/i18n/diagnostics, and dev-only Tweakpane Lab.
  - Added strict v1 game contract and host MessageChannel bridge: ACKed locale/audio/motion snapshots, safe revisions, terminal timeouts, and no empty patches.
  - Selected one same-origin iframe at a time and Cloudflare Workers Static Assets; rejected direct DOM mounting, game Service Workers, legacy storage import, and silent compatibility paths.
  - Added content-derived build IDs, fixture-backed artifact gates, and three-viewport Playwright/visual checks for diagnostics, motion, focus, Lab, and the three-channel audio UI.
- next: Import the pinned PulseLinkOverdrive history under `games/pulse-link-overdrive`, preserve its upstream logic baseline, then add the explicit guest boot adapter without carrying its Service Worker or old public settings ownership.
- gate: start-slice-1
- risks:
  - No game code is in this repository yet; the current cards intentionally link to upstream originals.
  - TUMBLEDRUM remains blocked from the public artifact until `provenance/upstreams.json` records distributable rights.
  - This repository has no initial commit or remote; establish them before relying on SHA-based handoff freshness.
- authority: constraints -> `AGENTS.md`; plan/gates -> `docs/PROJECT_PLAN.md`; upstream facts -> `docs/UPSTREAM_AUDIT.md`; stack/hosting -> `docs/DEPENDENCY_DECISIONS.md`; decisions -> `docs/adr/`; dev commands -> `docs/DEVELOPMENT.md`
- stale-first: `verified` expires after any source, dependency, or deployment-config change; re-derive with `vp run ready`, `vp run e2e:lab`, `vp run e2e`, and `vp run deploy:dry-run`.
