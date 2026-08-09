# Handoff

## Shipped system

GameYard currently presents PulseLinkOverdrive, TUMBLEDRUM, and CrownBreaker through one React Hub and one active same-origin iframe. The strict ordered `site.assembly.json` v2 registry is the only production admission list and supplies package identity, manifest/presentation sources, development ports, stages, and production-input allowlists. The versioned `MessageChannel` contract is the only Hub/Guest runtime path. Public locale, audio/motion settings, focus/pause/fullscreen policy, diagnostics, PWA lifecycle, catalog, deployment, and release identity belong to the Hub; game rules, rendering, input semantics, audio graphs, saves, content, and game-specific accessibility remain local to each game.

Production is served by one Cloudflare Worker from the same immutable artifact:

- root: `https://gameyard.hitsuki.space/`
- repository mount: `https://gameyard.hitsuki.space/GameYard/`

Root assets use Cloudflare Static Assets directly. Only the exact `/GameYard` mount enters `deployment/cloudflare-worker.mjs`, which strips that prefix and fetches the same `ASSETS` binding. `gameyard.hitsuki.space` is the sole production origin; the production Worker does not publish a `workers.dev` endpoint. No second build, fallback route, remote game embed, compatibility alias, or per-game Service Worker exists.

## Release authority

- constraints and runtime boundary: `AGENTS.md`
- architecture and completed migration: `docs/PROJECT_PLAN.md` and `docs/adr/`
- development, diagnostics, PWA, validation, and deployment: `docs/DEVELOPMENT.md`
- upstream rights and fixed revisions: `docs/UPSTREAM_AUDIT.md` and `provenance/`
- automated verification/deployment: `.github/workflows/verify-and-publish.yml`
- no-rebuild tag/Release publication: `.github/workflows/publish-release.yml`
- source/build/protocol/manifest/provenance/deployment identity: `tooling/release-metadata.mjs`

`Verify and publish` builds exactly one artifact for each `main` source SHA. Every smoke, visual/localization/accessibility/stress gate, Cloudflare dry-run, and production deploy downloads and re-verifies it. `Publish verified release` accepts the successful `main` run ID and exact package tag, downloads the original Actions ZIP, checks its SHA-256 against the artifact API, re-verifies metadata and both live mounts, and then creates the tag and GitHub Release without rebuilding or clobbering.

## Continuation rules

Start from a clean `main` equal to `origin/main`. Use `vp` for all project operations. Preserve the single-frame/strict-contract boundary, explicit offline saves, one Hub Service Worker, `gameyard.*` storage namespace, relative asset URLs, and fail-fast configuration. Do not revive standalone products, legacy storage imports, production Lab mutation, cross-version negotiation, or alternate deployment paths.

For a release investigation, identify the GitHub Release tag, source SHA, Verify/deploy run ID, Actions artifact ID/digest, `gameyard@<build>` ID, Cloudflare Worker version, and live root/prefix result before changing code. Release-specific evidence belongs in the GitHub Release and the closing Issue #16/roadmap comments rather than in this evergreen handoff.
