# Progress

Running status of the project. Newest entries at the top of each section.
Append here for every slice; never rewrite history.

**Last updated:** 2026-10-22

---

## Current state

| Signal | State |
| --- | --- |
| `npm run verify` | ⚠ **last known green locally:** typecheck clean, lint 0 errors / 656 warnings, orphan check clean across 118 files, 86 tests passing. Heavy verification no longer runs on this machine (guide §4) — it runs on GitHub Actions via `ci.sh`. |
| Lint ceiling | `--max-warnings=0` (warnings denied, guide §4). **CI lint currently FAILS** until the 656 existing warnings are burned down — this is the active blocker (see Q-005). |
| Test suite | 12 files / 86 tests (last run green locally; re-verified on CI via `ci.sh`). |
| Working tree | clean, committed and pushed |
| GitHub Actions | ✅ **operational** — CI green on Linux + Windows + macOS (runs `39566612176`, `39574556505`), Security Scanning green, Android APK build green. |
| Android APK | ✅ **built in CI** — artifact `VellumScribe-Android-APKs-real`, `versionName=3.1.0 versionCode=30100`, **`signed=false`** |
| Signed APK | ⛔ not produced — no keystore yet (Q-002) |
| Guide adoption | ✅ documentation set + CI-first agent definitions (commit `5743e45`), model map `docs/current-model-map.md` |

**Status sentence:** code compiles and tests pass; CI is operational on three
OS runners with a real (unsigned) APK. The active blocker is lint:
`--max-warnings=0` now denies warnings (guide §4), so CI lint fails until the
656 existing warnings are burned down via `ci.sh` iterations. Per guide §4,
fixing CI is the first task.

**Verification protocol (CI-first, guide §4):** no `npm test`, `npm run build`,
`tsc`, `vitest`, or `npm ci` runs on this machine. Verify changes with
`~/.config/opencode/scripts/ci.sh run "<description>"`, which pushes to the
`opencode/ci` branch, opens a PR to `main`, and runs the repository's CI.

---

## Free models in use (session 2026-10-22)

Recorded in `docs/current-model-map.md`: orchestrator `opencode/big-pickle`,
coder `opencode/glm-5.3-flash-free#high`, explorer `opencode/mimo-v2.6-flash-free`,
reviewer `opencode/beam-free#high`, tester `opencode/deepseek-v4.1-flash-free#high`,
ci-runner `opencode/beam-free#high`, fixer `opencode/glm-5.3-flash-free#high`,
docs-writer `opencode/big-pickle`. Provider order: OpenCode free → NVIDIA free.

---

**Owner decisions captured during discovery** (see `DECISIONS.md` D-001…D-006):

- Inspiration list: **whisper** and **Obsidian** (clean-room rules written).
- Next major version targets **Android + Web only** — deliberately narrower
  than the guide's default.
- Repository goes **public**, so Actions minutes and the verification signal
  are available on this ~2.7 GiB machine that cannot build the APK.
- Out of scope: real-time collaboration, multi-user/teams, open-ended AI chat.
- Sub-agents wired to **OpenCode free (Big Pickle) only** for now.

**Added:**

| File | Purpose |
| --- | --- |
| `docs/project-brief.md` | Discovery answers A–E |
| `docs/scope.md` | In / out / undecided scope |
| `docs/inspiration.md` | Clean-room statement for whisper + Obsidian |
| `docs/product-name.md` | Locked name and usage rules |
| `docs/assumptions-and-questions.md` | 6 facts, 4 assumptions, 11 open questions |
| `docs/parity.md` | Capability tracker with test evidence |
| `docs/development.md` | Commands, constraints, per-slice workflow |
| `docs/qc/manual-checklists.md` | 7 manual QC sections |
| `IMPLEMENTATION_PLAN.md` | Tracks A–D of vertical slices |
| `REQUIREMENTS_TRACEABILITY.md` | 31 requirements → files → tests |
| `DECISIONS.md` | 14 decisions with rejected alternatives |
| `PROGRESS.md` | This file |
| `ATTRIBUTION.md` | Verified licences for all 46 dependencies + vendored MIT whisper.cpp/ggml |
| `.opencode/agents/*.md` | orchestrator, coder, explorer, reviewer |

**Coverage reality check:** 13 of 31 traceable requirements have automated
tests. **R-2 (notes & capture) has none** — tracked as slices C-1…C-3.

**Also:** `.gitignore` now refuses `guide.md`, so the local operating guide
can never be committed.

**QC:** docs-only slice — `docs/qc/manual-checklists.md` §1 walked; `npm run
verify` re-run and green.

---

## 2026-10-21 — Slices: audio fixes, Android signing, brand assets, perf

Committed in order: `cd6fdab`, `db1ba53`, `d5cd3e0`, `aaf968c`, `4599431`,
`c40455f`, `25515cd` (on top of `1a24d82`, `2f85098`, `c359207`, `2701f3a`,
`8914d9e`, `2cba918`).

- **Audio import & transcription, 4 bugs + tests.** `AudioContext` closed in a
  `finally`; real cloud MIME type and media key; `resolveTranscriptionPolicy`
  (D-101); non-silent 30-minute truncation (D-102). Plus `stopRecording`
  asymmetry, `extensionForAudioMime`, deduplicated import pipeline into
  `AudioRecordingManager.importAudioFile`, `audioImportNotices.ts`,
  `wasTruncated` / `wasConversionSkipped` surfaced in the editor banner and
  modal, `MAX_IMPORT_BYTES` / `MAX_CONVERSION_BYTES`, `KNOWN_LIMITATIONS` §7.
- **Dead code removed:** `AudioRecordingManager.blobToBase64`,
  `src/services/UniversalCaptureService.ts`. Orphan check green for 118 files.
- **Android signing & versioning:** `signingConfigs.release` from
  `android/keystore.properties` or `VELLUM_*` env; `versionCode` derived from
  `package.json` (D-201); debug and release share one key (D-202); assemble
  logs `VELLUM: <task> -> versionName=… versionCode=… signed=…`.
- **CI:** keystore decoded from secrets, tagged releases fail without a key,
  `platforms;android-36` + `build-tools;36.0.0`, pinned
  `ndkVersion = "26.1.10909125"`, invalid `secrets`-in-`if:` removed.
- **Brand assets:** `scripts/generate-brand-assets.mjs` + `npm run assets:brand`;
  26 PNGs regenerated; adaptive background `#FFFFFF` → `#09090B`;
  `<monochrome>` added; unused template vectors deleted (D-204).
- **Performance:** eager entry-graph JS 893.12 kB → 867.76 kB by making
  `NoteShareModal` and `TranscriptionRecoverySheet` lazy (D-301).
- **Docs:** `docs/ANDROID_E2E_AUDIT.md`, `BUILD_RELEASE.md` §2/2b/5,
  `KNOWN_LIMITATIONS.md` §7–8.

**Carried forward at the time:** Actions runs failed before any step
(Q-001) — **since resolved, see below.**

---

## 2026-10-21 — Slice A-1: Actions restored, first APK built

Pushed as `5d68e2b`. This was the first time this repository's own commits
ran through the pipeline (the 2026-10-16 pushes produced no runs at all —
Actions was down then).

| Run | Workflow | Result |
| --- | --- | --- |
| `39566612176` | CI | ✅ `verify (ubuntu-latest)`, `verify (windows-latest)`, `verify (macos-latest)` all green |
| `39566612176` | CI · `format (staged, non-blocking)` | ❌ red **by design** (Q-004); `continue-on-error`, workflow still `success` |
| `39566612217` | Security Scanning | ✅ Dependency Audit + CodeQL green |
| `39566612127` | Build Android APK | ✅ artifact `VellumScribe-Android-APKs-real` |

The Android build logged, for both tasks:

```
VELLUM: assembleDebug   -> versionName=3.1.0 versionCode=30100 signed=false
VELLUM: assembleRelease -> versionName=3.1.0 versionCode=30100 signed=false
VELLUM: release APK is UNSIGNED. Add android/keystore.properties or
        VELLUM_KEYSTORE_* env vars so a newer build can replace an installed copy.
```

**What this proves:** the derived `versionCode` (D-201) works, the SDK 36 +
pinned NDK toolchain install works, and the whole pipeline runs on all three
OSes. **What it does not prove:** anything about signing — the APK is
unsigned, so it cannot be installed (Q-002). The multi-OS matrix was new in
this commit and Windows/macOS both passed with the explicit `shell: bash`
override, confirming the `check:orphans` and vitest steps are portable.

Slice A-1 is Done; A-2 is Ready and blocked only on the keystore.

---

## 2026-10-21 — Slice B-2 + D-1: workflow cleanup and scope decisions

**Owner approval received** (Q-008, Q-006, Q-007).

- **Workflows.** Deleted 19 permanent no-op stubs (`if: false` jobs named
  "(disabled)"). Converted the 4 push-triggered auto-commit bots
  (`fix-ai-handlers`, `fix-settings-jsx`, `remove-orphans`, `ux-residual`)
  to `workflow_dispatch` only. `vendor-whisper.yml` untouched.
  `.github/workflows/` is now 8 files; no workflow fires on `push` except
  `build-apk`, `ci` and `security-scan`. Decision D-304.
- **Scope.** Continuous cross-device sync → explicitly out of scope for this
  major version (Q-007). Plugin marketplace → deferred to a later phase
  (Q-006; "plugin can wait until later in the project"). Recorded in
  `docs/scope.md` and D-004.
- `npm run verify` re-run: green (0 errors, 656 warnings, 118 files
  orphan-clean, 86 tests). Workflow YAML parses cleanly.

## 2026-10-22 — Apply updated guide (CI-first, lint warnings denied, model map)

**Owner approved:** apply `guide.md` §4 (CI-first / no local heavy builds) and
§5 (free-model policy + dynamic model selection).

- **Commit `5743e45` pushed to `main`:** CI-first subagent configuration.
  Agents now run on OpenCode free models (see `docs/current-model-map.md`);
  orchestrator plans and delegates only (edit:deny, bash:deny); coder/tester/
  fixer may run only light lint/format scripts; explorer/reviewer/docs-writer
  are read-only; `ci-runner` owns all GitHub interaction via `ci.sh`.
- **`docs/current-model-map.md` added:** role → model map with re-selection
  procedure per guide §5.2/§5.6.
- **Lint now denies warnings:** `eslint src --max-warnings=0` (guide §4
  Required CI). CI lint **currently FAILS** until the 656 existing warnings
  are burned down — this is the active blocker (#1 below). Fixing CI is the
  first task per guide §4; burn-down happens via `ci.sh` iterations, never
  locally.
- `npm run verify` is no longer run locally (guide §4). Last known green:
  typecheck clean, 0 lint errors / 656 warnings, 118 files orphan-clean, 86
  tests.

---

## Open blockers (carry into next session)

1. **Q-005 (ACTIVE) — lint warnings denied, CI failing.** `--max-warnings=0`
   now fails on 656 pre-existing warnings. Burn down in slices of ≤50 via
   `ci.sh` iterations (edit locally, verify on CI). Until this is resolved,
   CI lint is red and per guide §4 this is the first task to fix.
2. **Q-002 — no release keystore (release blocker).** Generate it per
   `docs/BUILD_RELEASE.md` §1, set the four `ANDROID_KEYSTORE_*` secrets,
   then re-run slice A-2 and confirm `signed=true`.
3. **A-3 — update-in-place proof** on a physical `arm64` device (needs a
   signed APK from blocker 2).
4. **Q-003 — `assetlinks.json` placeholder** once the keystore exists.
5. **Q-004 — format baseline:** 194 unformatted files. Staged non-blocking
   format job in CI until slice B-3 establishes the baseline.
6. **Q-009 / Q-010 — product decisions:** `arm64`-only ABI acceptability and
   ~30 MB bundled Whisper model in APK assets.
7. **C-1…C-5 — test coverage gaps** (R-2 notes & capture has no tests).
