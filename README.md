# GameYard

GameYard is a Vite+ workspace for presenting experimental HTML games through one exhibition Hub. The Hub owns navigation, shared comfort settings, locale selection, lifecycle coordination, diagnostics, and deployment. Each game keeps its own simulation, renderer, input semantics, audio design, saves, and text catalog inside an isolated iframe.

The current milestone initializes the workspace and contract boundary. The three existing games have not yet been copied into this repository.

## Commands

```powershell
vp install
vp run e2e:install
vp run dev
vp run tooling:test
vp run ready
vp run e2e:lab
vp run e2e
vp run deploy:dry-run
```

Production builds expose a deterministic `hub@<sha256>` artifact ID derived from the
declared Hub source, contract source, workspace configuration, and lockfile. A missing
required input stops the build. `ready` and `e2e` also reject output URLs that would
break when the Hub is hosted below a repository path prefix.

See `docs/PROJECT_PLAN.md` for the implementation audit and migration order.
