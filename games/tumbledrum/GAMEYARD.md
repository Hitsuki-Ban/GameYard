# TUMBLEDRUM in GameYard

This directory was imported without squashing from
`Hitsuki-Ban/TUMBLEDRUM@ba6fc680626ac59db793175122600369d48f9834`.
The subtree import commit keeps that upstream revision as its second parent.

Issue #7 preserves the standalone program before the GameYard runtime adapter is
introduced. The upstream HTML, CSS, JavaScript, Python tests, screenshots, and
single-file builder remain byte-identical to `SHA256SUMS.txt`. GameYard adds only
this note, the Vite+ workspace manifest, and `tests/gameyard_baseline.py`.

Use the workspace entry points from the repository root:

```powershell
vp run tumbledrum#browser:install
vp run tumbledrum#build
vp run tumbledrum#test
```

The baseline verifies all 36 upstream checksums (every pinned blob except the
checksum manifest itself), rebuilds the dependency-free
single-file edition, runs the original smoke/integration/regression/full-run
programs, and covers desktop, portrait-touch, and landscape-touch layouts for
both the served source and `file://` build. Every browser program receives the
Chromium executable owned by the pinned `playwright==1.61.0` installation;
external browser overrides and missing pinned browser binaries fail immediately.
The repository-level `vp run e2e:install` invokes this browser install alongside
the separate Chromium revision used by GameYard's Node Playwright suite.
The responsive pass starts Campaign through real mouse/touch input, observes the
live RAF loop calling `update(1 / 120)`, and verifies that the fixed-step
accumulator is drained below one simulation step after each rendered frame.

The upstream full-run uses unseeded `Math.random`, so its reported completion
time is observational rather than a deterministic lock. The executable baseline
instead fixes the byte-identical source, `FIXED_DT = 1 / 120`, all 13 authored
stages, Campaign victory, and Endless wave 12. Issue #8 may add an explicit RNG
seam only if the adapter work needs one; Issue #7 does not alter gameplay code.

TUMBLEDRUM is deliberately absent from `site.assembly.json`. This standalone
baseline is not copied into the public GameYard artifact; Issue #8 owns the
explicit INIT/MessageChannel adapter and production stage.
