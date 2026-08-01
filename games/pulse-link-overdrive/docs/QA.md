# QA checklist

Release target: `1.1.0`

## Automated gates

```powershell
vp run release:tumbledrum
```

- [x] Logic baseline is exactly 36 assertions and 293 locks.
- [x] Stage manifest lists the exact sorted asset graph.
- [x] Root and repository-prefix hosting both load relative assets.
- [x] Production artifact contains no Service Worker, install manifest, debug surface, or lab mutation tool.

## Host contract

- [x] No App, RAF, audio context, storage access, or runtime listener exists before valid INIT.
- [x] Transport ready follows successful App initialization; lifecycle ready is emitted in the following task.
- [x] Host audio master/music/sfx, reduced motion, screen shake, and live locale updates apply without persistence.
- [x] Pause freezes simulation, input, and music; pause/resume UI only requests the Hub transition.
- [x] Dispose is terminal and cleans RAF, listeners, subscriptions, timers, MessagePort, AudioContext, and vibration.
- [x] Diagnostics are read-only, bounded, and exclude raw storage, complete saves, and screenshots.

## Play and accessibility

- [x] DUEL, BLITZ, and LAB preserve pinned rules and result handling.
- [x] Keyboard, pointer, touch, assist controls, and standard gamepad input release cleanly when disabled.
- [x] Desktop, portrait mobile, and landscape mobile layouts remain usable.
- [x] English, Japanese, and Simplified Chinese update menus, HUD, results, tutorial, and assistive text live.
- [x] Color glyphs and haptics persist under `gameyard.game.pulse-link-overdrive.*`; public settings do not.
