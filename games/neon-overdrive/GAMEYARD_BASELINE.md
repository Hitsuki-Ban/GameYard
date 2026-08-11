# Neon Overdrive GameYard baseline

Issue #50 records the supplied Build 1.0 behavior before the architectural and performance work in Issue #54. The twelve archive-owned files remain byte-for-byte source evidence. GameYard drivers, screenshots, performance evidence, and provenance records sit beside that source and do not turn the legacy IIFE, debug global, storage envelope, or local launchers into production contracts.

## Evidence and admission boundary

- Owner-supplied archive: `games/neon-overdrive.zip`, SHA-256 `08ceef2d930c801bab64ff4cbeab39129d3f5f088ee9344e3ac0a80e5e976883`.
- Complete 13-entry archive inventory and imported-file digests: `provenance/neon-overdrive/source-inventory.json`.
- Ownership direction and the explicit absence of a repository, revision, and public license: `provenance/neon-overdrive/distribution-grant.md` and `provenance/neon-overdrive/source-snapshot.json`.
- The snapshot status is `source-evidence-only`. Issue #52 is the production-admission gate; the archive, standalone HTML, local launchers, supplied previews, baseline tools, screenshots, and performance evidence are not production inputs.

## Protected player journey

The deterministic Story journey fixes seed `0x4e454f4e` and protects these externally visible facts in one flow:

- title and zero-score presentation;
- Story start with three shields, four Story-only reboots, automatic fire, and the Act I opening pattern;
- movement and focus behavior, manual `DROP`, a scored kill and increasing chain, pause/resume, a three-card upgrade, the next act, a visible boss, victory/result, retry, and restart;
- a Story victory unlocks Endless, records the Story best score, and presents both facts again after reload;
- audio cue identity and its position in the journey.

Rush and Endless are focused checkpoints rather than duplicated full journeys. Rush starts at 180 seconds with Rank 0.48 and ends as `TIME CLEAR`; Endless starts at Rank 0.42 and produces its first 70-second sector boss.

The input baseline compares logical outcomes instead of multiplying the whole scenario per device:

| Logical command | Keyboard      | Pointer/touch                            | Gamepad            |
| --------------- | ------------- | ---------------------------------------- | ------------------ |
| Move            | arrows / WASD | mouse position or touch drag             | left stick / D-pad |
| Focus           | Shift / X     | secondary mouse button                   | LB / LT            |
| Drop            | Space / Z     | primary mouse button or on-screen `DROP` | A / RT             |
| Pause           | Escape / P    | browser visibility policy                | Menu               |

Touch has no separate focus command in the supplied design. The baseline does not invent one.

## Visual references and known defects

The canonical source set uses Chromium at 1440×900 and DPR 1 with animation disabled, a deterministic seed, screen shake off, and flashes off. It contains:

- `title`: title hierarchy and cabinet composition;
- `active-pattern`: a real eight-second Story window with source enemies, enemy bullets, player fire, RUSH feedback, power feedback, and HUD state;
- `upgrade`: the three-card inter-act choice;
- `boss`: Mirror Saint, boss HUD, warning banner, player/effect layers, and active build state;
- `result`: Story victory, score, grade, record marker, and retry/title actions.

Playwright keeps platform-specific goldens under `tests/baseline.spec.ts-snapshots/`; the Windows capture set is the source evidence recorded in this issue. A target platform must generate its own golden rather than copying pixels from another operating system.

Two responsive captures are deliberately not passing goldens:

- `tests/known-defects/portrait-390x844-title-overflow.png` records that the scaled fixed cabinet stops well above the bottom of a tall portrait viewport instead of using the available play area comfortably.
- `tests/known-defects/landscape-844x390-title-clipping.png` records severe horizontal title/cabinet clipping in a short landscape viewport.

These images are inputs to Issue #54. The baseline does not normalize, crop, or cosmetically repair the supplied layout.

## Audio event contract

The baseline protects cue names, trigger identity, and ordering at deterministic Story checkpoints. It does not protect oscillator graphs, envelopes, pitch calculations, synthesis implementation, or mixing.

| Cue          | Observable event                                                 |
| ------------ | ---------------------------------------------------------------- |
| `select`     | title/menu action, resume, retry, or another accepted UI command |
| `graze`      | near-miss feedback, with the source's short repeat suppression   |
| `kill`       | ordinary enemy defeat                                            |
| `bigKill`    | carrier/elite defeat or boss phase break                         |
| `driveReady` | DRIVE first reaches the prompted ready state                     |
| `drive`      | OVERDRIVE activation or upgrade acceptance                       |
| `pulse`      | manual/automatic guard or OVERDRIVE finisher                     |
| `hit`        | a real player hit                                                |
| `phase`      | power increase, boss phase change, or upgrade selection opening  |
| `warning`    | elite warning or boss entrance                                   |
| `shotAccent` | throttled accent on a subset of player shots                     |
| `victory`    | boss defeat or successful result                                 |

The main test asserts that `select`, `drive`, `kill`, `phase`, `warning`, and `victory` occur in their expected journey states, including a result-state victory cue.

## Profile facts

Only player-visible data facts are protected:

- Story, Rush, and Endless maintain independent best scores;
- Endless begins locked;
- a Story victory enables the Endless mode card and changes its description;
- a new Story best and the Endless unlock survive reload.

The legacy localStorage key, serialized object shape, permissive parsing, and fallback values are explicitly not protected. A GameYard Guest must use the `gameyard.*` namespace and the current Hub contract without reading or migrating the standalone key.

## Before-refactor performance harness

`performance/neon-overdrive.perf.spec.ts` records one bounded diagnostic matrix, not a release budget. The checked-in aggregate is `performance/before-evidence.json`.

The capture is fixed to Playwright 1.62.1 / Chromium 151.0.7922.34, Windows, 1440×900, DPR 1, seed `1313165134`, a two-second fixed 60 Hz simulation warm-up with one terminal render, and a 1.2-second natural-RAF sample. CDP supplies 4× CPU throttling and Task/Script/Layout duration; in-page observers record RAF intervals, frames over 20 ms, long tasks, update calls versus playing simulation ticks, HUD mutations, audio-scheduler calls, and entity peaks. Only aggregate JSON is committed—no raw trace.

The hidden measurement is intentionally named `hidden-frozen`. Chromium automation does not naturally change `document.hidden` when `Page.setWebLifecycleState` freezes a target, so the harness explicitly controls `document.hidden`, dispatches a test-owned `visibilitychange` event through the source game's real listener, and then applies the real CDP `frozen` lifecycle. The evidence records both mechanisms and must not be described as a naturally backgrounded browser tab. Every audio-scheduler invocation records its wall-clock timestamp; host-side timestamps taken after the frozen acknowledgement and immediately before the thaw command partition the calls into pre-freeze, frozen-window, and post-thaw buckets.

| Scenario      | RAF evidence                                    | CDP Task / Script / Layout | Activity and peaks                                                                                                                                     |
| ------------- | ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal        | 3 intervals; p95/max 416.7 ms; all 3 over 20 ms | 30.78 / 16.11 / 2.61 ms    | 20 playing ticks, 90 HUD mutations, 1 audio callback; peaks 3 enemies / 2 enemy bullets / 39 player bullets / 102 particles                            |
| 4× CPU        | 1 interval at 83.3 ms, over 20 ms               | 127.74 / 66.15 / 3.17 ms   | 9 playing ticks, 45 HUD mutations, 0 audio callbacks                                                                                                   |
| Dense         | 1 interval at 116.7 ms, over 20 ms              | 20.06 / 12.00 / 0.48 ms    | 10 playing ticks, 45 HUD mutations, 2 audio callbacks; peaks 422 enemy bullets and 395 particles                                                       |
| Paused        | 3 intervals; p95/max 500 ms; all 3 over 20 ms   | 14.40 / 3.82 / 0 ms        | 20 update calls but 0 playing ticks, 0 HUD mutations, and 1 audio callback                                                                             |
| Hidden-frozen | 0 RAF intervals                                 | 26.33 / 3.35 / 0 ms        | 0 update calls, playing ticks, and HUD mutations; 35 audio calls: 0 pre-freeze, 34 during the 1,201 ms frozen window, 1 after thaw; final state paused |

The very small frame counts are themselves part of the before evidence: percentile values for the 4× and dense rows each describe a single observed interval and are not population estimates. Likewise, zero `longtask` observer entries do not contradict the severe RAF gaps. Issue #54 should compare a new capture with the same harness contract instead of turning these numbers into guessed thresholds.

## Regeneration

- Player journey and visual comparison: `vp run test`.
- Windows golden refresh after intentional baseline review: `vp run test:update`.
- Performance verification against the checked-in browser/harness contract: `vp run perf`.
- Performance evidence replacement is an explicit review action using `NEON_PERF_RECORD=1`; ordinary tests never rewrite it.

All commands run from `games/neon-overdrive`. The archive-owned source files must remain unchanged.
