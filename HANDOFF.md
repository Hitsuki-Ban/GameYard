# Handoff

## Current system

GameYard is a five-game personal web exhibit: Pulse Link Overdrive, TUMBLEDRUM, CrownBreaker, Kamifuda Runner, and Neon Overdrive. `site.assembly.json` is the only ordered production registry. The Hub runs one active same-origin iframe and communicates with every game only through the versioned `MessageChannel` contract.

Production is served from one Cloudflare Worker at both:

- `https://gameyard.hitsuki.space/`
- `https://gameyard.hitsuki.space/GameYard/`

The Hub owns catalog navigation, public locale/settings, focus/pause/fullscreen policy, diagnostics, PWA behavior, and deployment. Each game owns rules, rendering, input meaning, audio, saves, content, and game-specific accessibility. There is one Hub Service Worker, no standalone production path, no remote embeds, and no compatibility runtime.

## Release path

`.github/workflows/verify-and-publish.yml` is the only automatic release path. It builds `dist` once, uploads it once, and all root/prefix/public/Cloudflare jobs download that same Actions artifact without rebuilding. GitHub Actions owns transport integrity. `.gameyard/release-metadata.json` is intentionally a small readable record of source SHA, build ID, protocol, and game versions; it is not a per-file hash ledger.

Preserve these high-value gates:

- registry and artifact structure validation;
- each game's owned behavior baseline;
- representative desktop/portrait/landscape browser journeys;
- root and `/GameYard/` PWA behavior;
- Cloudflare dry-run and post-deploy live smoke.

Do not recreate prior-artifact delta reports, internal SHA inventories, repeated metadata verification in every job, Cartesian screenshot matrices, or a second GitHub Release packaging path.

## Continue

Start from clean `main == origin/main` and use only `vp` for project operations. The active roadmap is tracked in GitHub issues #38, #46, and #53. Project architecture and validation details live in `AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/DEVELOPMENT.md`, `docs/adr/`, and `provenance/`.
