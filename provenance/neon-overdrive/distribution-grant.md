# Neon Overdrive GameYard distribution direction

Recorded on 2026-08-10 from Codex task `019fbbb1-910c-7652-9cb5-f27d8150dd88` for the game archive supplied by the owner of the `Hitsuki-Ban` GameYard project.

## Owner direction

The project owner placed `games/neon-overdrive.zip` in the GameYard workspace, identified Neon Overdrive as one of the newly added games, and directed Codex to integrate every game into the public GameYard exhibition. The owner also explicitly permitted large architecture-aligned refactoring while preserving each game's play and presentation.

That direction authorizes the GameYard work needed to copy the supplied archive contents into `Hitsuki-Ban/GameYard`, preserve and measure the player-facing behavior, replace the standalone implementation with the GameYard Guest architecture, build static artifacts, and publish, host, display, run, and distribute those GameYard sources and artifacts through `Hitsuki-Ban/GameYard`, GitHub Pages, and Cloudflare.

## Evidence boundary

The supplied archive has SHA-256 `08ceef2d930c801bab64ff4cbeab39129d3f5f088ee9344e3ac0a80e5e976883`. It contains no repository URL, Git revision, LICENSE file, downloaded fonts, external runtime assets, or network-loaded dependencies. GameYard therefore records it as an owner-provided source snapshot and does not invent an upstream repository, revision, tree, or public license.

The archive's runtime visuals are Canvas 2D and CSS, and its audio is synthesized at runtime with Web Audio. The three PNG files are owner-supplied presentation previews that are not loaded by the runtime.

## Limits

This is project-specific distribution direction for GameYard, not a general-purpose public open-source license for a standalone Neon Overdrive repository. It does not add claims about commercial use, sublicensing outside GameYard, warranty, exclusivity, unlisted third-party works, or legal ownership beyond the owner direction recorded above.

The supplied archive, single-file standalone build, local-server launchers, preview PNGs, source-baseline tooling, raw performance traces, and tests are evidence only. They are not authorized as the future GameYard production build path and must remain outside production inputs and artifacts.
