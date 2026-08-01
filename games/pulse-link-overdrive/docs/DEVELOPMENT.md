# Development

PULSE LINK // OVERDRIVE is a Vite+ GameYard Guest. Use `vp` for every package operation.

## Module boundaries

- `src/config.js` owns constants, utilities, events, and game-owned saves.
- `src/i18n.js` owns the `zh-CN`, `ja`, and `en` catalogs; the Hub owns locale selection.
- `src/model.js` owns deterministic board rules, matches, modes, and AI; it does not render the DOM.
- `src/input.js` normalizes keyboard, pointer, touch, and standard Gamepad input.
- `src/render.js` draws snapshots and effects without deciding game outcomes.
- `src/audio.js` owns procedural audio and haptics while applying Host audio levels.
- `src/app.js` is the sole Guest bootstrap and connects Host lifecycle, settings, locale, input, diagnostics, persistence, simulation, and presentation.

Keep rule changes in the simulation layer and presentation changes in the UI layers. Do not make rendering code mutate match results.

## Run and verify

```powershell
# From the repository root: start the same-origin Hub and watched Pulse stage.
vp run dev

# From this package: verify or build the Guest stage.
vp run test
vp run build
```

The Playwright baseline injects the logic modules into a blank browser page; it must report exactly 36 assertions and 293 locks. The build writes only to `.gameyard/stage/games/pulse-link-overdrive`, uses relative asset URLs, and declares every emitted file in `game.manifest.json`.

The Guest does not run without a valid same-origin Hub INIT. Its pause UI requests a Hub lifecycle change; only acknowledged Host commands change runtime state.
