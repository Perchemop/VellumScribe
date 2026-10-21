# Progress

Running status of the project. Newest entries at the top of each section.
Append here for every slice; never rewrite history.

**Last updated:** 2026-10-21

---

## Current state

| Signal | State |
| --- | --- |
| `npm run verify` | ✅ green locally (typecheck clean, lint 0 errors / 656 warnings, orphan check clean across 118 files, 86 tests passing) |
| Test suite | ✅ 12 files / 86 tests |
| Working tree | clean, committed and pushed |
| GitHub Actions | ✅ **operational** (verified 2026-10-21) — CI `39566612176` green on Linux + Windows + macOS, Security Scanning `39566612217` green |
| Android APK | ✅ **built in CI** — run `39566612127`, artifact `VellumScribe-Android-APKs-real`, `versionName=3.1.0 versionCode=30100`, **`signed=false`** |
| Signed APK | ⛔ not produced — no keystore yet (Q-002) |
| Guide adoption | ✅ documentation set + agent definitions added (slice B-1), commit `5d68e2b` |

**Status sentence:** code and tests are green locally *and* CI is green on
three OS runners, with a real (unsigned) APK produced. The one remaining
release blocker is the missing signing key (Q-002) — without it no build can
ever be installed or update an installed copy.

---

## 2026-10-21 — Slice B-1: Adopt the build guide as the operating process

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

## Open blockers (carry into next session)

1. **Q-002 — no release keystore (the last release blocker).** Generate it
   per `docs/BUILD_RELEASE.md` §1, set the four `ANDROID_KEYSTORE_*` secrets,
   then re-run slice A-2 and confirm `signed=true`.
2. **A-3 — update-in-place proof** on a physical `arm64` device (needs a
   signed APK from blocker 1).
3. **Q-003 — `assetlinks.json` placeholder** once the keystore exists.
4. **Q-008 — legacy workflows** (15 stubs + 4 auto-commit bots): awaiting the
   owner's approval to remove / restrict.
5. **Q-006 / Q-007 — scope undecided:** plugin marketplace, continuous sync.
6. **Q-004 / Q-005 — quality debt:** 194 unformatted files, 656 lint warnings.
7. **C-1…C-5 — test coverage gaps** (R-2 has no tests at all).
