# Development

PULSE LINK // OVERDRIVE is a zero-dependency browser project. There is no package install or bundler step: `index.html` loads the CSS and plain JavaScript modules directly, and the Python standard library serves and assembles releases.

## Module boundaries

- `src/config.js` owns constants, utilities, events, and local saves.
- `src/i18n.js` owns the `zh-CN`, `ja`, and `en` catalogs, system-language resolution, and localized manifest selection.
- `src/model.js` owns deterministic board rules, matches, modes, and AI; it does not render the DOM.
- `src/input.js` normalizes keyboard, pointer, touch, and standard Gamepad input into game actions.
- `src/render.js` draws snapshots and effects without deciding game outcomes.
- `src/audio.js` owns procedural sound, music, and haptics.
- `src/app.js` connects the page lifecycle, menus, persistence, input, simulation, and presentation.

Keep rule changes in the simulation layer and presentation changes in the UI layers. Do not make rendering code mutate match results.

## Run and test

```bash
uv run python -m http.server 8080
```

Use `http://localhost:8080/` for the game and `http://localhost:8080/tests/logic-smoke.html` for deterministic core regression checks. The smoke page is the test entry point and must report PASS before release.

## Standalone build

```bash
uv run python tools/build_standalone.py
```

This writes `dist/pulse-link-overdrive-standalone.html`, with the project CSS and scripts embedded for direct offline play.

## GitHub Pages

Publish the repository root as the Pages artifact. The root `index.html`, `src/`, `assets/`, `manifest.zh-CN.webmanifest`, `manifest.ja.webmanifest`, `manifest.en.webmanifest`, Service Worker, and styles are one deployable static site; no dependency installation or production build is required for Pages.
