# Kamifuda Runner GameYard distribution direction

Recorded on 2026-08-10 from Codex task `019fbbb1-910c-7652-9cb5-f27d8150dd88` for the game archive supplied by the owner of the `Hitsuki-Ban` GameYard project.

## Owner direction

The project owner placed `games/kamifuda-runner-v4.zip` in the GameYard workspace, described Kamifuda Runner as one of two newly added games, and directed Codex to integrate both games into the public GameYard exhibition. The owner also explicitly permitted large-scale architecture-aligned refactoring while preserving each game's play and presentation.

That direction authorizes the GameYard work needed to copy the supplied archive contents into `Hitsuki-Ban/GameYard`, preserve and test the player-facing behavior, replace the standalone implementation with the GameYard Guest architecture, build static artifacts, and publish, host, display, run, and distribute those GameYard sources and artifacts through `Hitsuki-Ban/GameYard`, GitHub Pages, and Cloudflare.

## Evidence boundary

The supplied archive has SHA-256 `5f2d6469b12ec50674b80aaa45a2519cad67fbf4938921e61814a458241f7752`. It contains no repository URL, Git revision, LICENSE file, recorded media, downloaded fonts, or external runtime assets. GameYard therefore records it as an owner-provided source snapshot and does not invent an upstream repository, revision, tree, or public license.

The archive's visuals are Canvas 2D and CSS, its audio is synthesized at runtime with Web Audio, and its only image is an inline SVG favicon. Named system fonts are references; no font binaries are distributed.

## Limits

This is project-specific distribution direction for GameYard, not a general-purpose public open-source license for a standalone Kamifuda Runner repository. It does not add claims about commercial use, sublicensing outside GameYard, warranty, exclusivity, unlisted third-party works, or legal ownership beyond the owner direction recorded above.

The Python packaging helper and its generated standalone/checksum outputs are source evidence only. They are not authorized as the GameYard production build path and are not part of future `productionInputs`.
