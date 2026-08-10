# Kamifuda Runner GameYard baseline

Issue #48 preserves the player-facing v4 behavior before the disposable Guest rebuild in #51. The archive-owned files remain byte-for-byte source evidence; all GameYard records, drivers, and tests live beside them rather than changing them.

## Evidence and production boundary

- Source archive: `games/kamifuda-runner-v4.zip`, SHA-256 `5f2d6469b12ec50674b80aaa45a2519cad67fbf4938921e61814a458241f7752`.
- Full 12-entry inventory and every imported file digest: `provenance/kamifuda-runner/source-inventory.json`.
- The archive has no repository, revision, or license metadata. `provenance/kamifuda-runner/source-snapshot.json` records explicit `null` values instead of inventing them, and binds the owner direction record by hash.
- `build.py` is packaging evidence only. Although the archive is named v4, the helper still emits `kamifuda-runner-v3-standalone.html`, `kamifuda-runner-v3.zip`, and `CHECKSUMS.txt` outside its source directory.
- The supplied archive, generated standalone HTML, generated ZIP/checksum package, Python packaging helper, candidate tooling, and baseline tests are excluded from `productionInputs`. Issue #55 admits only the modular Guest, standard manifest/presentation sources, responsive catalog covers, package metadata, TypeScript config, and production Vite config.

## Protected observable contract

The baseline protects Normal and Hard starting facts, horizontal movement, manual stamp commands, damage/score outcomes, pause/resume, act upgrade choice, result/restart, independent mode records, the Normal-clear Hard unlock, and the Hard-clear ember unlock. It also protects the fixed 120 Hz simulation feel through deterministic externally observed checkpoints.

It does not protect auto-boot, the IIFE, debug globals, internal functions, state-object shape, DOM nesting, RAF ownership, legacy storage keys/schema, v2/v3 migration, or the Python builder. The modular Guest runs these same journey assertions through an explicit testkit build; its production stage uses the shared manifest pipeline and contains no mutation/debug surface.

Keyboard and pointer/touch controls share two logical commands:

- `move`: Arrow Left/Right or A/D, and pointer/touch drag on the playfield.
- `stamp`: Space/Enter, and the on-screen stamp control when charged.

The baseline executes each input form inside one journey and compares its observable command outcome; it does not duplicate the journey per device.

## Host motion policy

Kamifuda applies the two Host motion settings independently with reduced motion taking priority:

- `motion.reduced` freezes decorative bob, drift, orbit, pulse, and flashing cues; disables camera shake and stamp hit-stop; and lowers the particle budget while preserving gates, warnings, the bounded live status, and other readable state.
- `motion.screenShake` controls only camera displacement while reduced motion is `false`.
- When reduced motion is `true`, camera displacement remains off regardless of `screenShake`; there is no competing game-local motion preference.

## Visual references

The canonical 1440×900 set contains title, active gate gameplay, upgrade choice, and result. Motion is reduced and the source simulation is explicitly rendered at deterministic checkpoints. These references preserve composition, palette, typographic character, hierarchy, and effect intent—not pixel identity of incidental animation frames.

`tests/known-defects/844x390-clipped-primary-action.png` records the supplied layout's clipped primary action in a short landscape viewport. It is evidence for #55 and is deliberately not used as a passing visual golden.

## Audio event contract

Only cue names and trigger identity are frozen. Oscillator graphs, envelopes, waveform, pitch implementation, and mixing remain replaceable.

| Cue      | Observable event                                                     |
| -------- | -------------------------------------------------------------------- |
| `click`  | menu interaction, secondary music beat, or encounter beat marker     |
| `drum`   | music downbeat, drum-formation volley, or drummer reinforcement      |
| `shot`   | non-drum player volley                                               |
| `gate`   | gate selection phase opens                                           |
| `tier`   | gate charge reaches a tier or a boss changes stage                   |
| `choice` | gate/upgrade choice, clear transition, or successful result emphasis |
| `fail`   | locked/invalid choice, missed gate, or failed run transition         |
| `shield` | player shield absorbs damage or an attack is blocked/intercepted     |
| `ready`  | a boss or encounter readiness cue reaches its action point           |
| `near`   | near-miss feedback                                                   |
| `hurt`   | unshielded crowd damage                                              |
| `kill`   | ordinary enemy defeat                                                |
| `boss`   | boss entrance or boss attack emphasis                                |
| `stamp`  | manual or automatic festival stamp activation                        |
| `boom`   | boss phase/defeat climax                                             |

## Profile facts

The baseline asserts only these external data facts: Hard begins locked; a Normal clear increments only the Normal record and unlocks Hard; a Hard clear increments only the Hard record and unlocks the `ember` appearance; total seals increase on finalized results. It intentionally makes no assertion about localStorage key names or serialized envelopes.
