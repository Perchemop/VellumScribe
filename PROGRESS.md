# Progress

Running status of the project. Newest entries at the top of each section.
Append here for every slice; never rewrite history.

**Last updated:** 2026-10-22

---

## Current state

| Signal           | State                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify` | ✅ **GREEN on CI (all three OS runners)** — `typecheck` + `lint` (0 warnings) + `check:orphans` + 86 tests. Run `1cbc192` on `opencode/ci`.                                                                |
| Format gate      | ✅ **required** since slice B-3 (D-407) — `prettier --check .` passes across every tracked file.                                                                                                           |
| Lint ceiling     | `--max-warnings=0` (warnings denied, guide §4). ✅ **CI lint PASSES — 0 warnings** (656 → 0 via slices B-4…B-7). The `verify` job now also runs `check:orphans` (✅ 119 files) and the 86-test suite (✅). |
| Test suite       | 12 files / 86 tests (last run green locally; re-verified on CI via `ci.sh`).                                                                                                                               |
| Working tree     | clean, committed and pushed                                                                                                                                                                                |
| GitHub Actions   | ✅ **operational** — CI green on Linux + Windows + macOS (runs `39566612176`, `39574556505`), Security Scanning green, Android APK build green.                                                            |
| Android APK      | ✅ **built in CI** — artifact `VellumScribe-Android-APKs-real`, `versionName=3.1.0 versionCode=30100`, **`signed=false`**                                                                                  |
| Signed APK       | ⛔ not produced — no keystore yet (Q-002)                                                                                                                                                                  |
| Guide adoption   | ✅ documentation set + CI-first agent definitions (commit `5743e45`), model map `docs/current-model-map.md`                                                                                                |

**Status sentence:** code compiles and tests pass; CI is operational on three
OS runners with a real (unsigned) APK. The active blocker is lint:
`--max-warnings=0` now denies warnings (guide §4), lint is now clean (B-4 → 332,
B-5 → 275, B-6 → 229, B-7 → 0), so `npm run verify` passes end-to-end on all
three OS runners. The remaining non-blocking red is the staged Prettier job
(slice B-3).

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

| File                                | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `docs/project-brief.md`             | Discovery answers A–E                                                     |
| `docs/scope.md`                     | In / out / undecided scope                                                |
| `docs/inspiration.md`               | Clean-room statement for whisper + Obsidian                               |
| `docs/product-name.md`              | Locked name and usage rules                                               |
| `docs/assumptions-and-questions.md` | 6 facts, 4 assumptions, 11 open questions                                 |
| `docs/parity.md`                    | Capability tracker with test evidence                                     |
| `docs/development.md`               | Commands, constraints, per-slice workflow                                 |
| `docs/qc/manual-checklists.md`      | 7 manual QC sections                                                      |
| `IMPLEMENTATION_PLAN.md`            | Tracks A–D of vertical slices                                             |
| `REQUIREMENTS_TRACEABILITY.md`      | 31 requirements → files → tests                                           |
| `DECISIONS.md`                      | 14 decisions with rejected alternatives                                   |
| `PROGRESS.md`                       | This file                                                                 |
| `ATTRIBUTION.md`                    | Verified licences for all 46 dependencies + vendored MIT whisper.cpp/ggml |
| `.opencode/agents/*.md`             | orchestrator, coder, explorer, reviewer                                   |

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

| Run           | Workflow                             | Result                                                                                    |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `39566612176` | CI                                   | ✅ `verify (ubuntu-latest)`, `verify (windows-latest)`, `verify (macos-latest)` all green |
| `39566612176` | CI · `format (staged, non-blocking)` | ❌ red **by design** (Q-004); `continue-on-error`, workflow still `success`               |
| `39566612217` | Security Scanning                    | ✅ Dependency Audit + CodeQL green                                                        |
| `39566612127` | Build Android APK                    | ✅ artifact `VellumScribe-Android-APKs-real`                                              |

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

## 2026-10-23 — Slice B-3: Prettier baseline + required format gate (D-407, Q-004 resolved)

- One dedicated mechanical `prettier --write .` pass, committed on its own:
  **148 tracked files** reformatted.
- `android/app/src/main/assets/**` (the web bundle `cap sync` copies into the
  Android project) added to `.prettierignore` — generated output must never be
  reformatted. Reverted the reformat of the 30 generated asset files.
- The `format` CI job is promoted from `continue-on-error: true`
  (`format (staged, non-blocking)`) to a **required** gate named `format`
  running `npm run format:check`. Guide §4's required-CI list is now complete.
- `docs/qc/manual-checklists.md` was reworded slightly: a list continuation
  starting with `signed=…` made Prettier's markdown printer non-idempotent
  (it alternated the indent on every pass), so the sentence now fits one line.
- Verified locally: `prettier --check .` → "All matched files use Prettier code
  style!", `eslint src` → 0 warnings (no semantic change).

---

## 2026-10-23 — Slice B-7 (DONE): lint gate is GREEN (275 → 0) 🎉

**`npm run verify` passes end-to-end on all three OS runners** — the first time
since the `--max-warnings=0` ceiling was set. Blocker **Q-005 is resolved**.

CI run for `1cbc192` (`opencode/ci`): `verify (ubuntu-latest)` ✅,
`verify (windows-latest)` ✅, `verify (macos-latest)` ✅, CodeQL ✅, CodeQL
Security Analysis ✅, Dependency Audit ✅. Only the deliberately non-blocking
`format (staged)` job is red (slice B-3 owns the Prettier baseline).

Because lint now passes, the `verify` job finally ran its later steps again:
`check:orphans` ✅ (119 files) and the **86-test suite** ✅ — neither had run
since lint went red on `ae01c47`.

The whole `no-explicit-any` class (229 sites) is gone: typed row shapes for
every SQLite query, typed request/response shapes at the AI boundaries,
`unknown` for genuinely opaque payloads (log data, import bundles) with type
predicates to narrow them, a shared `src/lib/binary.ts` for the
`Uint8Array → BufferSource/BlobPart` boundary, and one `conn` accessor in
`NativeSqliteAdapter` instead of 30 `any`-typed null checks.

Work landed as `B-7a…B-7e`, each verified on CI with `typecheck` green:
B-7a `storage`/repositories/`geminiService` (229→148) · B-7b repositories +
`AiResultValidator` (→104) · B-7c logger/speech/sqlite-engine/crypto/provenance
(→53) · B-7d storage/settings/notebooklm/misc (→2) · B-7e final two sites (→0)
plus the typecheck fallout fixes (global picker hook declaration, `../../lib/binary`
path, checklist/notebooklm test fixtures, sync-job entity union).

---

## 2026-10-23 — Slice B-7 (earlier commits): type the `no-explicit-any` sites (275 → 53)

Every remaining warning is `@typescript-eslint/no-explicit-any`. Typed row shapes,
payload shapes and boundary casts — no blanket `any → unknown` sweeps that would
break call sites. Verified after each sub-batch on CI (typecheck green):

| Sub-slice | Files                                                                                                                                                                                               | Remaining |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| B-7a      | `lib/storage.ts` (46)                                                                                                                                                                               | 183       |
| B-7b      | `lib/sqlite/sqliteRepository.ts` (18), `lib/geminiService.ts` (17)                                                                                                                                  | 148       |
| B-7c      | `repositories/*` (31), `services/AiResultValidator.ts` (13)                                                                                                                                         | 104       |
| B-7d      | `lib/logger.ts` (9), `lib/sqlite/sqliteEngine.ts` (8), `lib/offlineTranscription.ts` (9), `lib/cloudBackupCrypto.ts` (7), `plugins/offline-ai/index.ts` (11), `services/AiProvenanceService.ts` (7) | **53**    |

Highlights:

- `lib/storage.ts` — ~35 `(SqliteRepository as any)` probes collapsed to direct
  calls: all 13 methods they guarded exist, and three guards referenced methods
  **that do not exist anywhere** (`deleteRecording`, `deleteOcrScan`,
  `cleanOrphanedMedia`) — removed as dead code and the follow-up gap logged as
  **Q-011** (SQLite has no recording/OCR delete path).
- `lib/geminiService.ts` — `GeminiPart`, `GeminiGenerateResponse`,
  `TranscribeSessionInit`, `ServerSummaryResponse` shapes; `parts` is now typed,
  the Google response is narrowed once instead of `(p: any)`, and `(blob as any).name`
  became `blob instanceof File`. `SummaryRequestOptions.transcripts/ocrScans/checklists`
  are now `Array<string | TranscriptRecord/OcrScanRecord/ChecklistItem>`.
- `services/AiResultValidator.ts` — untrusted AI payloads get a real
  `AiExtractionPayload` shape with type predicates, plus a shared
  `inRange(sourceSegments, total)` helper (this also fixed the previous
  silent `priority` widening).
- `lib/logger.ts` — logged payloads are `unknown` (redaction already sanitises
  them); `lib/sqlite/sqliteEngine.ts` — typed SQLite memory store, typed save
  timer, `toArrayBuffer()` helper for the wasm payload.
- `lib/cloudBackupCrypto.ts` — one `asBufferSource()` helper replaces five
  `as any` byte casts, and the backup envelope is a `BackupEnvelope` interface.

**Verification** — `ci.sh run`: `typecheck` ✅ on all three OSes, `lint` ❌ 53
warnings (0 errors), orphans ✅, Security ✅.

---

## 2026-10-23 — Slice B-6: a11y, hook facts, rule scope (275 → 229)

**Every warning now is `@typescript-eslint/no-explicit-any` (229).** 0 errors.

- **`jsx-a11y/click-events-have-key-events` (15 → 0).** Clickable cards/rows
  (`ArchiveSection`, `RecentNotesSection`, `TranscriptViewer`, the sketch
  thumbnail) got real button semantics — `role="button"`, `tabIndex={0}` and an
  Enter/Space `onKeyDown`. Modal backdrops/dialogs (`CloudConnectModal`,
  `EventNotesList` ×3, `FirstTimeUserGuideModal`,
  `TranscriptionRecoverySheet`, `NoteRevisionsModal`) got an Escape handler, and
  two `stopPropagation`-only handlers were removed (one was dead — its parent
  had no click handler; the other became redundant once the backdrop guarded on
  the event target).
- **`react-hooks/immutability` (6 → 0).** The effects referenced helpers
  declared below them; the helpers now come first.
- **`react-hooks/exhaustive-deps` (10 → 0).** Honest fixes: `useCallback` around
  `refreshTranscriptData`, `handleDismiss`, `handleCleanup` and
  `saveHistoryState` so the effects can depend on them; a stable setter added to
  a dep list; `EventNotesList`'s count memos now genuinely project onto `notes`
  (the stored media is not reactive, so `notes` really is the dependency, and
  consumers only ever look up rendered notes); missing `note.*` fields and
  `sketchData`/`initialDataUrl` added where they co-change with the existing
  keys; the `App` bootstrap effect reads `notes`/`showToast` through refs
  instead of re-running migrations on every render.
- **`no-useless-assignment` (3 → 0).** Removed dead initialisers
  (`cloudBackupCrypto`'s envelope, `geminiService`'s `sessionId`/`serverSegments`).
- **`react-hooks/set-state-in-effect` (14) scoped off** — owner decision,
  recorded as `D-406`: it flags idiomatic hydrate/reset effects and the app does
  not use the React Compiler. `exhaustive-deps` and `immutability` stay on.
- `AiProvenanceBadge` now derives provenance with `useMemo` instead of
  state+effect (the lookup is synchronous).
- Fixed one regression caught by CI: I had dropped `setStats` from
  `SettingsView` although line 1604 still calls it.

**Verification** — local `eslint src` → 229 warnings / 0 errors, matching CI.

---

## 2026-10-22 — Slice B-5: eliminate every unused variable (332 → 275)

**Goal:** remove the whole `@typescript-eslint/no-unused-vars` class (57 warnings).

- **`SettingsView`'s advanced-AI cluster was dead code.** Ten handlers
  (`handleSaveGroqKey`, `handleClearGroqKey`, `handleSaveDeepgramKey`,
  `handleClearDeepgramKey`, `handleTestGoogleKey`, `handleTestGroqKey`,
  `handleTestDeepgramKey`, `handleProbeLocalWhisper`, `handleKeyFileUpload`,
  `handleUpdateAiSettings`) plus `handleCopyCmd` were unreachable, as were the
  `serverProvidersConfig` fetch effect and the Groq/Deepgram/Whisper verify
  state they fed. Removed them; the states whose setter was only reachable from
  that dead code were reduced to their rendered value (or dropped), which is
  behaviour-identical because those setters never executed. `SettingsView.tsx`
  is now **fully warning-free**.
- Unused props/params are prefixed (`_onDeleteEvent`, `_reminderAt`,
  `_locationName`, `_onRefreshNotes`, `_mimeType`, `_noteId`); unused catch
  bindings dropped; remaining dead locals removed (`currentRelease`,
  `hasExistingSqliteData` + its count queries, `lastEndMs`, `targetId`, unused
  `loading`/`speechRecognitionEnabled` state, the dead `recommendSpeechModel`
  body).

**Verification** — `ci.sh run`, run on `opencode/ci`:

| Check                           | Result                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| `typecheck`                     | ✅ pass (one regression caught and fixed: `setStats` is used at line 1604) |
| `lint`                          | ❌ 275 warnings (0 errors) — down from 332; `no-unused-vars` now 0         |
| `format (staged, non-blocking)` | ❌ (expected; slice B-3 owns the baseline)                                 |

Remaining mix: `no-explicit-any` 229, `jsx-a11y/click-events-have-key-events`
15, `react-hooks/set-state-in-effect` 12, `react-hooks/exhaustive-deps` 10,
`react-hooks/immutability` 6, `no-useless-assignment` 3.

---

## 2026-10-22 — Slice B-4: lint burn-down batch 1 + remove local-Ollama provider

**Owner decision:** remove Ollama entirely (guide §5.1.4 "Do not use Ollama or
any local model hosting"); logged as `D-405`.

**Lint burn-down batch 1** (warnings **656 → 332**, `0` errors):

- Removed ~70 genuinely unused import specifiers/statements across 25 files
  (line-precise, parse-verified per file).
- Routed 79 `console.*` calls in app code through `AppLogger` (redaction +
  in-app log view); `src/lib/logger.ts` keeps `console` as the single sink
  behind an explicit `eslint-disable`.
- `catch (x: any)` (96 sites) → `catch (_x)` + `asErrorLike(_x)` via the new
  `src/lib/errorLike.ts`.
- Misc: empty-catch comments, `prefer-const`, useless assignments, `cause` on
  rethrown errors, removed a Node-only `require('path')` and a dead
  `handleFileUpload`/`fileInputRef` (no `type="file"` input existed).
- **Latent bug fixed:** `CloudSettingsPanel` was imported but never rendered,
  so the backup-passphrase panel was unreachable. It is now mounted in the
  cloud tab (this also keeps the orphan check green).

**Ollama provider removed end to end:**

- `LlmProvider` union, provider metadata, `ollamaEndpoint`/`ollamaModel`
  settings, `setOllamaEndpoint`, `probeOllamaEndpoint` (`src/lib/aiSettings.ts`).
- `GeminiApiService.executeOllama` + the Ollama synthesis route
  (`src/lib/geminiService.ts`).
- The whole "Local Ollama" tab, endpoint presets, troubleshooting box, model
  list and failure shortcuts (`src/components/AiStudioKeyModal.tsx`).
- Dead Ollama state/handlers in `SettingsView.tsx`; the provider label in
  `NoteEditorWriteFirst.tsx`.
- Server: `/api/ollama` rate-limiter mount and the `/api/ollama/tags` +
  `/api/ollama/generate` proxy routes (`server.ts`).
- Remaining LLM providers: Google (Gemini), Groq, Built-in Offline Engine.

**Verification** — `ci.sh run`, run `39766964875` on `opencode/ci`:

| Check                           | Result                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `typecheck`                     | ✅ pass (after fixing one bad import specifier, `lib/errorLike` → `./lib/errorLike`) |
| `lint`                          | ❌ 332 warnings (0 errors) — active blocker, down from 656                           |
| `format (staged, non-blocking)` | ❌ 182 files (expected; slice B-3 owns the baseline)                                 |
| `orphans` / `tests`             | not reached (lint aborts `npm run verify`)                                           |

Remaining warning mix (per OS run): `no-explicit-any` ≈229,
`no-unused-vars` ≈57, `jsx-a11y/click-events-have-key-events` 15,
`react-hooks/set-state-in-effect` 12, `react-hooks/exhaustive-deps` 10,
`react-hooks/immutability` 6, `no-useless-assignment` 3.

---

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

1. ~~**Q-005 — lint warnings denied, CI failing.**~~ ✅ **RESOLVED 2026-10-23** —
   656 → 0 across slices B-4…B-7; `npm run verify` is green on
   ubuntu/windows/macos (`1cbc192`) including`check:orphans` and the 86 tests.
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
