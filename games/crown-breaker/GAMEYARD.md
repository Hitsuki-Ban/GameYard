# GameYard baseline

CROWN//BREAKER is imported from upstream revision `1f7b911926c786043ba793e16c4f25cd5f523b21` as the third GameYard migration slice. The gameplay source, localization catalog, page structure, presentation, and assets remain the upstream baseline in this issue.

The workspace uses the root-pinned Vite+ toolchain. Run project commands from the GameYard root through `vp`; this package does not own a nested package-manager version or lockfile.

## Baseline gates

- `vp run crown-breaker#check` keeps the upstream syntax, asset, localization, static, stage, enemy, and trait gates in one broad execution chain. The individual `check:stages`, `check:enemies`, and `check:traits` entries remain available for focused upstream maintenance.
- `vp run crown-breaker#sim -- --runs <count> --policy <greedy|random> --seed-base <seed>` runs the upstream deterministic browser simulator.
- `vp run crown-breaker#build` creates the production single-file artifact at `dist/crown-breaker.html`.
- `vp run crown-breaker#baseline` runs the broad checks, builds and black-box verifies the production artifact, then runs exactly 100 greedy simulations from seed base 1000 and compares their schema, summary, and canonical report hash with the committed fixture.

The standalone builder deliberately strips the upstream QA mutation hook and Service Worker registration. It fails when those transforms stop matching exactly once or when any forbidden production symbol survives. Upstream QA hooks remain available only in source-based development gates until the later GameYard lab/testkit integration owns them.

The pinned 100-run result is 64 wins and 36 losses, with no QA, simulation error, or simulation timeout failures. The complete summary is stored in `tests/fixtures/simulation-baseline.json`; its canonical JSON SHA-256 is `4911ab81e19d102b6f06457e7f66b0a7262273871cd0745bf176884e6f2d9a44`. Two independent runs produced byte-identical JSON reports before the fixture was committed.
