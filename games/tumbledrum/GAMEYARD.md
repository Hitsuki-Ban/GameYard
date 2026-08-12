# TUMBLEDRUM in GameYard

This directory originates from
`Hitsuki-Ban/TUMBLEDRUM@ba6fc680626ac59db793175122600369d48f9834`.
The fixed upstream revision, project-specific distribution rights, and admitted
production inputs are recorded in GameYard's provenance registry. The current
workspace contains the explicit INIT/MessageChannel adapter and is registered in
the five-game production artifact; the old standalone checksum inventory remains
historical source evidence rather than an additional runtime gate.

Use the workspace entry points from the repository root:

```powershell
vp run tumbledrum#browser:install
vp run tumbledrum#build
vp run tumbledrum#test
```

The package gate builds the registered GameYard stage, runs the preserved
smoke/integration/regression/full-run behavior, and covers desktop,
portrait-touch, and landscape-touch layouts. Every Python browser program uses
the Chromium executable owned by the pinned Playwright installation; external
browser overrides and missing pinned browser binaries fail immediately. The
repository-level `vp run e2e:install` installs that browser alongside the
separate Chromium revision used by GameYard's Node Playwright suite.

The accelerated full-run owns one explicit gameplay seed and simulation-clock
origin at the start of both Campaign and Endless and disables decorative motion
for that synchronous test loop. Presentation timing therefore cannot shift
gameplay RNG or moving-stage phases before or during the baseline. The gate
preserves `FIXED_DT = 1 / 120`, all 13 authored stages, Campaign victory,
Endless wave 12, save outcomes, and the production gameplay implementation
without retries or an expanded timeout.
