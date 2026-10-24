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

| Stage | Milestone                                | Scope                                                                                                                                                                         | Readiness                                                    |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| ✅    | Foundation                               | CI (3-OS), SQLite persistence, orphan/dead-code gate, format gate                                                                                                             | 100%                                                         |
| ✅    | v0.1.0+ functional build                 | Notes, events, audio transcription, APK pipeline                                                                                                                              | 100%                                                         |
| 🚧    | **3.1.1 — Quality gate hardening**       | Lint 656→0, format baseline, CodeQL hardening (C-2), path containment, rate limits                                                                                            | ~85%                                                         |
| 🚧    | **3.2.0 — Test coverage (C-1…C-5)**      | R-2 notes & capture has **0 automated tests**; backup restore, native inference on hardware                                                                                   | ~30%                                                         |
| 🚧    | **3.2.x — Signed update path (A-2/A-3)** | Release keystore, `signed=true`, update-in-place proof on a physical device, `assetlinks.json`                                                                                | 0% (blocked on Q-002)                                        |
| 🚧    | **Launch & community readiness**         | `VISION`/`GOVERNANCE`/`CONTRIBUTORS`/`CODE_OF_CONDUCT`/`SECURITY`/`ACCESSIBILITY`, issue + PR templates, secret-licence-SBOM gates, branch protection, private vuln reporting | ~95% (open: Q-012…Q-018 maintainer decisions)                |
| ⬜    | 3.3.0 — Crash reporting                  | In-app report with user consent → GitHub Issues (user token only)                                                                                                             | ~10% (ErrorBoundary + log viewer exist; no issue submission) |
| ⬜    | 4.0.0 — Polish & finish                  | A11y, empty/error states, performance, full §9 quality gates                                                                                                                  | TBD                                                          |

## Feature readiness (evidence-based)

Readiness = verified implementation share of each capability area, from
`REQUIREMENTS_TRACEABILITY.md` (31 requirements, 13 with automated tests).

| Area                      | Implemented | Auto-tested | Notes                                          |
| ------------------------- | ----------- | ----------- | ---------------------------------------------- |
| R-1 Persistence           | 100%        | 40% (2/5)   | WAL/queue and orphan-repair untested           |
| R-2 Notes & capture       | 100%        | 0% (0/5)    | **Largest gap** — C-1…C-3                      |
| R-3 Audio & transcription | 100%        | 50% (4/8)   | Native REAL mode needs on-hardware proof (C-5) |
| R-4 Security              | 100%        | 50% (2/4)   | C-2 hardening underway                         |
| R-5 Optional cloud        | 100%        | 80% (4/5)   | Off by default, consent-gated                  |
| R-6 Release & platform    | 75%         | 25% (1/4)   | Blocked on Q-002 keystore                      |

## Known limitations (current)

- Release APKs are **unsigned** (Q-002) — cannot replace an installed copy.
- `signed=true` update-in-place is unproven on hardware (A-3).
- R-2 (notes & capture) has no automated tests.
- Code-scanning alerts on the server proxy are being burned down (C-2; ~59 open
  after parts 1–6 — rate limits, path containment, argv subprocesses, CORS
  allow-list, memory-only passphrase).
- Maintainer decisions still open for launch: Q-012…Q-018 in
  `docs/assumptions-and-questions.md`.
- CI actions are pinned by major-version tag, not commit SHA (D-417) — a
  tracked follow-up on the launch milestone.

## Release history

See `CHANGELOG.md` and the GitHub Releases page. Tags `v*.*.*` publish a
Release with APK artefacts and SHA-256 checksums.
