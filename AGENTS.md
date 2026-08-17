# GameYard Project Rules

## Toolchain

- This is a Vite+ monorepo. Use `vp` for every project operation: install, add, remove, update, dev, check, test, build, preview, run, and pack.
- The underlying package manager is pinned by `packageManager`. Do not run project-level `pnpm`, `npm`, or `npx` commands directly.
- Keep Node aligned with the machine's Vite+ `system_first` environment. Add `.node-version` only when the project intentionally requires a different Node version.
- Required inputs, schemas, tools, and configuration fail fast. Do not add compatibility aliases, silent defaults, migration shims, or alternate runtime paths unless a written ADR requires them.

## Runtime architecture

- Games run only inside one same-origin iframe at a time. Direct DOM mounting, Shadow DOM mounting, Module Federation, and remote legacy embeds are out of scope.
- Hub and game communicate only through the versioned `MessageChannel` contract. Protocol or build mismatches fail visibly; there is no cross-version negotiation.
- The Hub owns catalog navigation, public locale/settings, focus and pause policy, fullscreen requests, diagnostics, deployment, and the eventual root PWA.
- Each game owns rules, rendering, input semantics, audio graph, save/run schema, content catalogs, and game-specific accessibility text.
- Do not register per-game Service Workers. A single Hub Service Worker may be introduced only after the runtime boundary is stable and covered by an ADR.
- Do not read old standalone-game storage keys or silently migrate them. New persisted keys use the `gameyard.*` namespace.

## Migration gates

- PulseLinkOverdrive is the first integration slice, TUMBLEDRUM second, CrownBreaker third.
- TUMBLEDRUM source and assets must not be copied into the public artifact until its repository contains an explicit license or an equivalent ownership record is committed under `provenance/`.
- Preserve upstream behavior with upstream tests before extracting shared code. Similar-looking game rules, renderers, input maps, audio cues, saves, and translation catalogs stay game-local.

## Diagnostics and quality

- Production diagnostics are read-only and bounded. Never export raw localStorage, complete saves, or automatic screenshots.
- Mutation tools live only in the explicit lab build. They must not survive production tree-shaking.
- Use deterministic contract tests, Playwright E2E, and screenshot baselines at desktop, portrait mobile, and landscape mobile sizes.
- Test both root hosting and a repository-style path prefix before release. All runtime asset URLs remain relative.

## Release artifact

- GitHub automation builds and uploads one site artifact per commit. Host smoke, Cloudflare dry-run, public journeys, and authenticated deployment download that artifact and never rebuild it.
- GitHub Actions owns download integrity through its artifact digest. `release-metadata.json` is a readable source/build/protocol/catalog summary, not a second file-hash ledger.
- Verify artifact structure after build and once before production deploy; downstream browser and Wrangler jobs validate the user-facing behavior they own instead of repeating the same metadata check.
- Cloudflare production deploys only from `main` through the `cloudflare-production` GitHub environment. Required secrets are `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
