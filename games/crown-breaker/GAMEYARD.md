# CrownBreaker in GameYard

CROWN//BREAKER is imported from upstream revision `1f7b911926c786043ba793e16c4f25cd5f523b21`. Its rules, renderer, input semantics, content, translations, save/run schemas, and deterministic simulator remain game-owned.

The game is an INIT-gated same-origin iframe guest. `src/main.js` connects through `@gameyard/guest-bridge`; only a valid Host context creates the `game.js` ESM factory and its DOM, storage, runtime state, timers, listeners, frame loop, and audio graph.

The Hub exclusively owns locale, master/music/sfx levels, reduced motion, screen shake, focus, input enablement, pause/resume, and disposal. The game persists only its save, active run, and the private flashes/hints preferences under strict `gameyard.game.crown-breaker.*.v1` envelopes. Invalid existing JSON or schemas fail initialization visibly.

## Commands

- `vp run crown-breaker#dev` serves `/games/crown-breaker/` on the strict port declared by the production registry and exposes its development manifest at `/games/crown-breaker/game.manifest.json`.
- `vp run crown-breaker#build` emits the relative production graph and strict manifest to `.gameyard/stage/games/crown-breaker`, then scans it for testkit, mutation, PWA, Service Worker, and legacy-storage residue.
- `vp run crown-breaker#check` builds the explicit testkit Host and runs the upstream asset, localization, static, stage, enemy, and trait gates.
- `vp run crown-breaker#baseline` adds the production build and fixed 100-run simulation fixture gate.
- `vp run crown-breaker#sim -- --runs <count> --policy <greedy|random> --seed-base <seed>` rebuilds the testkit Host and runs the deterministic simulator.

The testkit is a separate build with `tests/testkit/host.js`; it establishes the same `connectGuest` MessageChannel handshake as the real Hub and exposes mutation hooks only after input and resume commands are acknowledged. Production defines the testkit branch false and removes it by DCE. The pinned 100-run result remains 64 wins / 36 losses with canonical SHA-256 `4911ab81e19d102b6f06457e7f66b0a7262273871cd0745bf176884e6f2d9a44`.
