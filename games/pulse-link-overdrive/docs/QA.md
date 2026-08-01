# QA checklist

Release target: `1.1.0`

## Automated gates

```powershell
vp run test
vp run check
vp run build
```

- [ ] Logic baseline is exactly 36 assertions and 293 locks.
- [ ] Stage manifest lists the exact sorted asset graph.
- [ ] Root and repository-prefix hosting both load relative assets.
- [ ] Production artifact contains no Service Worker, install manifest, debug surface, or lab mutation tool.

## Host contract

- [ ] No App, RAF, audio context, storage access, or runtime listener exists before valid INIT.
- [ ] Transport ready follows successful App initialization; lifecycle ready is emitted in the following task.
- [ ] Host audio master/music/sfx, reduced motion, screen shake, and live locale updates apply without persistence.
- [ ] Pause freezes simulation, input, and music; pause/resume UI only requests the Hub transition.
- [ ] Dispose is terminal and cleans RAF, listeners, subscriptions, timers, AudioContext, and vibration.
- [ ] Diagnostics are read-only and bounded.

## Play and accessibility

- [ ] DUEL, BLITZ, and LAB preserve pinned rules and result handling.
- [ ] Keyboard, pointer, touch, assist controls, and standard gamepad input release cleanly when disabled.
- [ ] Desktop, portrait mobile, and landscape mobile layouts remain usable.
- [ ] English, Japanese, and Simplified Chinese update menus, HUD, results, tutorial, and assistive text live.
- [ ] Color glyphs and haptics persist under `gameyard.game.pulse-link-overdrive.*`; public settings do not.
