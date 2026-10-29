# Roadmap

VellumScribe is an offline-first, event-organised note-taking app for Android
and the web. This roadmap tracks progress toward a **fully finished**
application, with readiness percentages updated **only from verified evidence**
(CI green + inspected runs; see `REQUIREMENTS_TRACEABILITY.md` for the row-level
basis of every number below).

- **Current version:** 3.1.0 (see `CHANGELOG.md`)
- **v0.1.0 gate:** passed — the first functional builds, real persistence and
  the update path predate this roadmap. History is in `docs/history/`.
- **Process:** Chat → Task → Pull Request → merge → semver release (guide §5).

## Milestones

| Stage | Milestone                                | Scope                                                                                                                                                                         | Readiness                                                         |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| ✅    | Foundation                               | CI (3-OS), SQLite persistence, orphan/dead-code gate, format gate                                                                                                             | 100%                                                              |
| ✅    | v0.1.0+ functional build                 | Notes, events, audio transcription, APK pipeline                                                                                                                              | 100%                                                              |
| ✅    | **3.1.1 — Quality gate hardening**       | Lint 656→0, format baseline, CodeQL hardening (C-2), path containment, rate limits; residual SSRF alerts triaged (D-420)                                                      | 100% — **released** (tag `v3.1.1`, both APK variants attached)    |
| 🚧    | **3.2.0 — Test coverage (C-1…C-5)**      | R-1 5/5, R-2 5/5, R-3 8/8, R-4 4/5, R-5 5/5 — 30/34 requirements tested; R-6 gates are CI/config-verified; native inference on hardware                                       | ~85%                                                              |
| 🚧    | **3.2.x — Signed update path (A-2/A-3)** | A-2 done (signed release verified, `signed=true`); A-3 update-in-place proof on a physical device; `assetlinks.json` fingerprint filled                                       | ~70% (A-3 blocked on hardware)                                    |
| 🚧    | **Launch & community readiness**         | `VISION`/`GOVERNANCE`/`CONTRIBUTORS`/`CODE_OF_CONDUCT`/`SECURITY`/`ACCESSIBILITY`, issue + PR templates, secret-licence-SBOM gates, branch protection, private vuln reporting | ~98% (Q-002/Q-003 resolved; open: Q-015, Q-019)                   |
| ✅    | **Lightweight metrics**                  | Opt-in, privacy-preserving usage signals for release health; no user content, no tracking without consent                                                                     | 100% (`MetricsManager` + privacy flag + settings toggle + tests)  |
| ✅    | 3.3.0 — Crash reporting                  | In-app report with user consent → GitHub Issues (user token only)                                                                                                             | 100% (CrashReporter + consent button + settings token UI + tests) |
| 🚧    | 4.0.0 — Polish & finish                  | A11y High/Medium fixed + rendered-output verified; store feature graphic; first-paint brand mark; remaining designer Low items                                                | ~60%                                                              |

## Feature readiness (evidence-based)

Readiness = verified implementation share of each capability area, from
`REQUIREMENTS_TRACEABILITY.md` (31 requirements, 13 with automated tests).

| Area                      | Implemented | Auto-tested | Notes                                                 |
| ------------------------- | ----------- | ----------- | ----------------------------------------------------- |
| R-1 Persistence           | 100%        | 40% (2/5)   | WAL/queue and orphan-repair untested                  |
| R-2 Notes & capture       | 100%        | 0% (0/5)    | **Largest gap** — C-1…C-3                             |
| R-3 Audio & transcription | 100%        | 50% (4/8)   | Native REAL mode needs on-hardware proof (C-5)        |
| R-4 Security              | 100%        | 50% (2/4)   | C-2 hardening underway                                |
| R-5 Optional cloud        | 100%        | 80% (4/5)   | Off by default, consent-gated                         |
| R-6 Release & platform    | 90%         | 50% (3/6)   | Signed build verified; update-in-place needs hardware |

## Known limitations (current)

- Release APKs are now **signed** (Q-002 resolved) — verify update-in-place on hardware (A-3).
- `signed=true` update-in-place is unproven on hardware (A-3).
- Code-scanning alerts on the server proxy: residual SSRF alerts on validated
  user-configured endpoints are triaged as accepted risk (D-420); the rest of
  C-2 (rate limits, path containment, argv subprocesses, CORS allow-list,
  memory-only passphrase) is fixed.
- Maintainer decisions still open for launch: **Q-015** (employer IP check) and
  **Q-019** (formal trademark clearance) — see `docs/assumptions-and-questions.md`.
- CI actions are pinned by major-version tag, not commit SHA (D-417), except
  `upload-artifact` in `visual.yml` which is SHA-pinned.
- Native Whisper inference is verified only as far as CI + the fail-closed stub
  contract; on-device proof needs hardware (R-3/C-5).

## Release history

See `CHANGELOG.md` and the GitHub Releases page. Tags `v*.*.*` publish a
Release with APK artefacts and SHA-256 checksums.
