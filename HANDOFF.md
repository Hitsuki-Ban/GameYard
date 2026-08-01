# Handoff

- source: Codex task `019fbbb1-910c-7652-9cb5-f27d8150dd88`, 2026-08-01
- repo: `F:\WorkSpace\GameYard` | branch `agent/issue-8-tumbledrum-runtime` | HEAD `e31e718e32fadbc8bc7ec0bd9ae207269892a19b` + pending Issue #8 diff | clean: no
- goal: Merge Issue #8, return to a clean synchronized main, then close Issue #9 with TUMBLEDRUM visual, lifecycle, and switching release evidence.
- verified: `vp run ready`, `vp run e2e` (21/21), `vp run e2e:lab`, `vp run tumbledrum#test` -> PASS; artifact `gameyard@1b572f5739b37004`, 14 files, 2 games @ `e31e718` + Issue #8 diff
- done-this-thread:
  - TUMBLEDRUM now boots only after exact INIT and uses ACKed Host locale/settings/input/lifecycle/fullscreen/diagnostics commands.
  - RAF, timers, listeners, input, audio, port, and iframe ownership have deterministic terminal cleanup.
  - Hub uses one generic `GameRuntime` for Pulse and TUMBLEDRUM; dev waits for both strict manifests.
  - TUMBLEDRUM owns one strict namespaced v1 save; old keys and standalone product paths are absent.
  - One production build assembles and verifies exactly Pulse, TUMBLEDRUM, and Hub.
- next: Finish Issue #8 independent review, commit/push/merge it, clean branches, then start Issue #9 from synchronized main.
- gate: run-ready-first
- risks:
  - Issue #9 still owns TUMBLEDRUM three-locale screenshots, root/prefix release coverage, and repeated Pulse/TUMBLEDRUM switching cleanup.
  - TUMBLEDRUM distribution remains limited by `provenance/tumbledrum/distribution-record.json`.
- authority: constraints -> `AGENTS.md`; plan -> `docs/PROJECT_PLAN.md` and Issues #1/#8/#9; runtime decision -> `docs/adr/0005-tumbledrum-single-runtime.md`; commands -> `docs/DEVELOPMENT.md`.
- stale-first: repo/HEAD/clean state expires at the Issue #8 commit; re-derive with `git status`, `git rev-parse HEAD`, and `gh issue view 8`.
