# GameYard import record

- Upstream: `https://github.com/Hitsuki-Ban/PulseLinkOverdrive`
- Pinned revision: `1e42e4130145922f22315e420daaabf44b42b325`
- Upstream tree: `ef5e42dcc3191dd8ccb846c88e14beb0bf68fa59`
- Imported path: `games/pulse-link-overdrive`
- Import method: non-squashed Git subtree; the GameYard import commit retains the pinned upstream commit as its second parent.
- Rights: source and original assets are MIT licensed by the upstream `LICENSE` and `README.md`; inspiration and originality notes remain in `docs/ORIGINS.md`.
- Asset evidence boundary: the readable SVG source is present, but the pinned upstream does not record how the 192 px and 512 px PNG icons were generated.

## Integration state

Pulse Link Overdrive is a single GameYard Guest. It has no direct page bootstrap, public locale/audio/motion ownership, legacy storage reader, Service Worker, install manifest, or debug mutation surface.

The Hub initializes it in a same-origin iframe through `@gameyard/guest-bridge`. The package emits only its Vite asset graph and strict `game.manifest.json` into `.gameyard/stage/games/pulse-link-overdrive`.

## Preserved baseline

```text
36 ASSERTIONS / 293 LOCKS
```

Run from this package or through the monorepo task graph:

```powershell
vp run test
vp run build
```
