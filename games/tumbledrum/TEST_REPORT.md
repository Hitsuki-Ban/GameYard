# TUMBLEDRUM 1.1.0 test report

Test date: 2026-07-24
Environment: Google Chrome 150.0.7871.130, Playwright 1.61.0, Python 3.12.13, Windows 11 Pro 10.0.26200.

Builds tested:

- source build from `index.html` over HTTP;
- self-contained `TUMBLEDRUM_PLAY.html` over `file://`;
- responsive layouts at desktop, portrait mobile, and landscape mobile sizes.

## Automated checks

The reproducible suite was run with the locked `uv` environment:

```powershell
node --check src/i18n.js
node --check src/content.js
node --check src/audio.js
node --check src/game.js
uv run python tools/build_single.py
uv run python tests/smoke_test.py <source-url>
uv run python tests/smoke_test.py <single-file-uri>
uv run python tests/integration_test.py <source-url>
uv run python tests/regression_test.py <source-url>
uv run python tests/full_run_test.py <source-url>
```

Result: every command passed; page errors and console errors were both zero.

## Localization and input

- System-locale routing passed for `ja-JP → ja`, `zh-CN → zh-Hans`, `en-US → en`, and unsupported `fr-FR → en`.
- Document title, metadata, accessible names, live status text, and all Canvas interface text changed with the active locale.
- Keyboard-only navigation opened Settings, changed language and toggles, and returned to the title screen.
- Pointer input selected each language segment directly.
- A manual language override survived reload; System mode remained a distinct persisted preference.
- A live setting announcement was retranslated when the effective language changed at runtime.
- Standard-mapping gamepad D-pad input drove menu/paddle navigation.
- A gamepad Start press paused the live loop; release and a second Start press resumed it with the correct localized status.
- Real touch input started Campaign, unlocked audio, moved the paddle, and launched the ball.

## Logic and state regressions

- The visible orientation of rotated bricks now matches collision and falling-cascade overlap geometry.
- All 13 authored stages rendered, stayed inside live bounds, and contained required targets.
- Every brick effect path was exercised: paper, clay, wood, bomb, spinner, bell, anchor, and gift.
- Anchor destruction released every linked brick into the falling cascade.
- Near upgrade caps, every offered charm still produced a benefit; all-max state skipped the choice.
- The Endless reserve charm added its reserve immediately.
- Campaign skill estimation reset for a new run and was not modified by Endless clears.
- The ten-wave stamp and corresponding best-wave value persisted atomically.
- Hidden `stageClear` state paused instead of progressing off-screen.
- Reduced-motion mode lowered a 100-particle burst to 30 particles, capped the pool, and suppressed streamers.

## Progression and stability

- Required-target depletion entered `stageClear`.
- Campaign exhaustion entered `retry` and incremented per-stage assistance.
- Endless exhaustion entered `gameover` and persisted the best wave.
- Boss supports exposed the core; charged contact dealt increased damage; defeat reached `victory` and persisted completion.
- A simulated paddle completed the full campaign and boss in 728.01 seconds of game time.
- A separate Endless simulation reached wave 12 and persisted the ten-wave stamp.
- A 20-second stability pass continued playing and destroying targets without an exception.

## Responsive browser review

- Desktop: 1050 × 1300 CSS pixels, Japanese/Chinese/English Settings reviewed visually.
- Portrait mobile: 390 × 844 CSS pixels, 2× device scale, touch enabled; no horizontal or vertical overflow.
- Landscape mobile: 844 × 390 CSS pixels, 2× device scale; the 3:4 Canvas remained centered with no overflow.
- Offline single-file build contained no external script or stylesheet references.

## Production consideration

The procedural WebAudio soundtrack and effects are fully functional and causally integrated. Bespoke studio recording or mastering remains optional pre-store polish rather than a functional blocker.
