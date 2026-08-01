# GameYard import record

- Upstream: `https://github.com/Hitsuki-Ban/PulseLinkOverdrive`
- Pinned revision: `1e42e4130145922f22315e420daaabf44b42b325`
- Upstream tree: `ef5e42dcc3191dd8ccb846c88e14beb0bf68fa59`
- Imported path: `games/pulse-link-overdrive`
- Import method: non-squashed Git subtree; the GameYard import commit retains the
  pinned upstream commit as its second parent.
- Rights: source and original assets are MIT licensed by the upstream `LICENSE`
  and `README.md`; inspiration and originality notes remain in
  `docs/ORIGINS.md`.
- Asset evidence boundary: the readable SVG source is present, but the pinned
  upstream does not record how the 192 px and 512 px PNG icons were generated.

## Preserved baseline

The pinned browser smoke reports exactly:

```text
PASS · 36 ASSERTIONS · 293 LOCKS
```

Run the GameYard gate and standalone builder from the repository root:

```powershell
vp run pulse-link-overdrive#test
vp run pulse-link-overdrive#build
```

The standalone output is package-local at
`games/pulse-link-overdrive/dist/pulse-link-overdrive-standalone.html`; it is
never written into the root deployment artifact.

This issue preserves the standalone game. It is not assembled into the public
Hub artifact until the explicit guest adapter is complete. Service Worker,
standalone public settings, legacy storage ownership, and the upstream debug
surface remain unchanged here and are removed as one direct runtime transition
in Issue #4.
