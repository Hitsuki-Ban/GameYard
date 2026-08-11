# Supplied responsive-layout defects

These captures preserve source behavior for Issue #50. They are evidence for the responsive rebuild in Issue #54, not passing visual goldens and not production inputs.

- `portrait-390x844-title-overflow.png`: a 390×844 portrait viewport. The fixed 540×960 cabinet is scaled and the title actions, footer, and touch affordance compete for the narrow screen.
- `landscape-844x390-title-clipping.png`: an 844×390 landscape viewport. The short-height media rules compress the cabinet while the fixed portrait playfield and title controls are visibly clipped.

Both captures use Chromium, DPR 1, the deterministic baseline seed, and the source title screen with animations disabled.

Regenerate them only against the source snapshot: run `vp run dev`, then run `vp exec node tests/capture-known-defects.mjs` in a second terminal.
