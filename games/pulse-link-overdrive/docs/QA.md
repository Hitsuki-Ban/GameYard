# QA checklist

Release target: `1.1.0`

This is a reproducible checklist, not a record of completed verification. Check an item only after observing it in the release candidate.

## Run

```bash
uv run python -m http.server 8080
uv run python tools/build_standalone.py
```

Open `http://localhost:8080/` and `http://localhost:8080/tests/logic-smoke.html`. The standalone output is `dist/pulse-link-overdrive-standalone.html`.

## Automated and build

- [x] The logic smoke page reports PASS with no failed assertion.
- [x] The standalone build finishes without an exception.
- [x] The generated standalone file starts a match when opened directly.
- [x] The main page and smoke page produce no unexpected console error.

## Localization

- [x] A fresh session follows a Chinese, Japanese, and English browser preference respectively.
- [x] An unsupported browser language uses English, the default language.
- [x] The language selector is usable on the title screen with mouse and touch.
- [x] Changing language updates menus, settings, help, HUD, results, tutorial, and accessibility text without a reload.
- [x] The selected language survives a reload.

## Play and input

- [x] DUEL ends correctly when either central spawn column tops out.
- [x] BLITZ ends at 90 seconds and reports its score-based result.
- [x] LAB resets the target board after target top-out.
- [ ] Keyboard actions cover movement, both rotations, soft/hard drop, attack, defense, and pause.
- [ ] Touch gestures, virtual controls, attack/defense controls, and pause all respond once per intended action.
- [ ] A standard-mapping gamepad covers movement, both rotations, soft/hard drop, attack, defense, and pause.

## Layout, accessibility, and offline

- [x] Title, match, pause, help, settings, and results fit at 390×844 and 844×390 without page scrolling.
- [ ] Reduced motion, screen shake, color glyphs, haptics, music, and sound settings take effect.
- [x] Keyboard focus and visible labels make every title-screen control operable without relying on color alone.
- [x] After one online visit, a reload works offline under the installed Service Worker.
- [x] The standalone file remains playable with network access disabled.

## Release result

Verified on 2026-07-22 with Chromium:

- Logic smoke: `PASS · 36 ASSERTIONS · 293 LOCKS`.
- JavaScript syntax, three manifests, and the 213,091-byte standalone build passed.
- Automatic and manual locale selection, reload persistence, dialog focus, localized assistive game status, damaged-save recovery, responsive layouts, cache isolation, and offline reload passed.
- The standalone file launched from `file://` in Japanese with no network request, manifest, Service Worker, console warning, or console error.

Unchecked items above still require a deliberate manual hardware or sensory-effects pass; they are not implied by this result.
