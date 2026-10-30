# Progress

Running status of the project. Newest entries at the top of each section.
Append here for every slice; never rewrite history.

**Last updated:** 2026-10-31

---

## Current state

| Signal           | State                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify` | ✅ **GREEN on CI for the 2026-10-31 polish slice** — `verify` ×3 OS (run `41138375751`), `format`, all security scans green; PR #147 merged to `main` (`8b66bfb`).                                         |
| Format gate      | ✅ **required** since slice B-3 (D-407) — `prettier --check .` passes across every tracked file.                                                                                                           |
| Lint ceiling     | `--max-warnings=0` (warnings denied). ✅ **CI lint PASSES — 0 warnings** (656 → 0 via slices B-4…B-7). The `verify` job runs `check:orphans` (each CI run) and the unit-test suite — green through v3.1.1. |
| Test suite       | ✅ green on PR #147 (run `41138375751`, 3 OS) — 31 `*.test.ts(x)` files incl. the new brand contract tests.                                                                                                |
| Working tree     | clean; slice merged to `main` (`8b66bfb`)                                                                                                                                                                  |
| GitHub Actions   | ✅ **operational** — CI green on Linux + Windows + macOS (runs `39566612176`, `39574556505`), Security Scanning green, Android APK build green.                                                            |
| Android APK      | ✅ **built in CI** — Releases `v3.1.1` (tag run `40960758092`): real + stub APKs; `versionName=3.1.1`, **`signed=true`**.                                                                                  |
| Signed APK       | ✅ produced — Q-002 resolved; signed=true                                                                                                                                                                  |
| Guide adoption   | ✅ documentation set + CI-first agent definitions (commit `5743e45`), model map `docs/current-model-map.md`                                                                                                |

**Status sentence:** the app is released through `v3.1.1` (signed real + stub
APKs attached to the GitHub Release). The active work is the 2026-10-31 4.0.0
polish slice — design-audit fixes (M-3, m-1…m-4, m-6, m-7), dead-code and
dependency removal, and wider rendered evidence — present in the working tree
and **pending `ci.sh` verification**. Still open: the raster store banner PNG
(m-5, owner decision), permission-denied UX for camera/mic/location, and the
on-hardware proofs in `docs/qc/on-device-proof-3.1.1.md`.

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

## 2026-10-31 — 4.0.0 polish: remaining design-audit Low items + wider rendered evidence

Verified on CI (PR #147, run `41138375751` on three OSes, visual job
`41138375669`, merged as `8b66bfb`):

- **Brand mark single-sourced (m-1, m-2).** New `src/components/BrandMarkGlyph.tsx`
  is the one source of the mark geometry; `AppLogo` uses it and Settings → About
  shows the real mark instead of a letter "V". `scripts/generate-brand-assets.mjs`
  now also copies `assets/brand/vellumscribe-mark.svg` → `public/favicon.svg`
  and the maskable variant → `public/maskable.svg`; `index.html`'s splash renders
  `/favicon.svg` instead of an inline copy.
- **No theme flash at first paint (m-4).** An inline head script applies the
  stored theme (`omninote_dark_mode_v1`, same JSON boolean as `AppContext`)
  before first paint; the splash follows the theme (light `#fafaf9` / dark
  `#121215`); `AppContext` keeps `meta[name=theme-color]` in step.
- **In-app delete confirmation (M-3).** The note editor's Delete uses the
  in-app confirm dialog instead of blocking `window.confirm`; Escape closes the
  editor sheets and the confirmation, and the destructive confirmation is on the
  Android back stack.
- **Forced-colours layer (m-6).** `@media (forced-colors: active)` in
  `src/index.css`: system-coloured control edges, explicit focus outline,
  decorative shadows removed.
- **Bottom-nav legibility (m-7).** Labels 10px → 11px with stable ids and
  `aria-current`.
- **Dead code/deps removed (m-3).** `RichBodyEditor.tsx` deleted (never
  imported); `motion` and `react-markdown` dropped from `package.json`; the
  lockfile is pruned and its version synced (3.1.0 → 3.1.1).
- **Rendered evidence widened.** `tests/visual.spec.ts` adds: Settings → About
  (desktop + 390px phone via the bottom nav), the in-app delete confirmation
  (asserts no native dialog fires), a forced-colours landing capture (the theme
  toggle keeps a 1px border), a dense virtualised list, and a pre-first-paint
  theme test (stored preference ⇒ `<html>` class + `theme-color` + splash
  surface).

Still open, honestly: **m-5** (a raster 1024×500 store banner PNG — needs an
SVG-rasteriser dependency or an external tool, an owner decision) and the
**permission-denied UI** for camera/mic/location (e2e audit §6).

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

## 2026-10-23 — C-2 CodeQL hardening, parts 1 & 2 (rate limits, argv, CORS, path containment)

Part 1 (PR #70, merged as `79cb9ef`): `/api/notebooklm/*` had **no rate
limiter at all**; added `notebooklmRateLimiter` and mounted it, and made rate
limiting explicit **per route** on the 8 flagged handlers (CodeQL only models
per-route middleware — the prefix mounts were there but invisible to it).

Part 2 (seccurity hardening, PR #71): replaced all 7 shell-interpolated
`execSync("ffmpeg/ffprobe ... \"${path}\"")` calls with `execFileSync`
**argument vectors** (`runFfmpeg(args, timeout)` / `runFfprobe(file, timeout)`),
so a path or numeric parameter can never be read as a shell metacharacter; and
tightened credentialed CORS so it is driven by a configured allow-list
(`APP_URL`, comma-separated) instead of reflecting the origin against the
request's own (spoofable) `Host` header.

Part 3 adds `resolveWithin(baseDir, ...segments)` — resolves the full path and
enforces that it stays inside `baseDir` — and uses it for the chunk-upload
target, the NotebookLM source files and the session segment/optimised files. A
character filter alone is not containment.

**Process note (recorded in D-410's file).** `ci.sh run` checks out
`opencode/ci` before committing, so a commit made on _another_ branch is
stranded: the tool prints "updated PR" and CI runs on an unchanged branch.
Hardening part 2 hit exactly that — PR #71 merged an empty branch and its
green checks meant nothing. The fix is to land the commit on `opencode/ci`
itself (reset to main, cherry-pick) before opening the PR.

Verified on GitHub Actions (verify ×3, format, Dependency Audit, CodeQL).

---

## 2026-10-23 — Adopt the updated guide: CTO.new model + tightened local rules (D-408)

The guide was re-read in full and its changes implemented as `D-408`:

- **Operating model is now Chat -> Task -> Pull Request -> human merge**
  (guide §5). `orchestrator` is the Chat-mode planner (writes Task briefs, never
  edits code); `coder` executes one bounded Task; `reviewer` reviews the PR
  read-only; the human merges (`docs/development.md` §5b).
- **Local work tightened (guide §4.2).** The former "very small, fast checks"
  allowance is gone — no local `eslint`, `prettier`, `tsc`, or tests. The
  `shell` allows for `npm run lint*`, `npm run format*`, `npx eslint*` and
  `npx prettier*` were removed from the `coder` and `reviewer` agent files.
- Tracking updates now cover `REQUIREMENTS_TRACEABILITY.md` **and**
  `PROGRESS.md` after each Task (guide §5.2), and its header now records the CI
  gate states.
- `ci-runner` remains the only GitHub interaction point; `tester`, `fixer` and
  `docs-writer` stay as supporting roles with no local toolchain access.

**Note on `CodeQL` (D-409).** GitHub default-setup CodeQL reports 68
pre-existing alerts (almost all in `server.ts`). They are visible on this PR
because the B-3 Prettier pass rewrote `server.ts` line by line and CodeQL's
diff-informed analysis now counts them as "in the diff". They are **not**
dismissed and **not** hidden — a dedicated hardening slice is scheduled, and the
owner triages in the Security tab until then.

---

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
2. ~~**Q-002 — no release keystore (release blocker).**~~ ✅ **RESOLVED
   2026-10-24** (D-421) — keystore wired to CI; `signed=true`; signed APKs ship
   on Release `v3.1.1`.
3. **A-3 — update-in-place proof** on a physical `arm64` device (signed APKs
   exist; the proof run is missing).
4. ~~**Q-003 — `assetlinks.json` placeholder**~~ ✅ **RESOLVED** — fingerprint
   filled from the release keystore (CHANGELOG 3.1.1).
5. ~~**Q-004 — format baseline**~~ ✅ **RESOLVED 2026-10-23** — slice B-3
   established the baseline; `format` is now a required CI gate.
6. **Q-009 / Q-010 — product decisions:** `arm64`-only ABI acceptability and
   ~30 MB bundled Whisper model in APK assets.
7. **C-1…C-5 — test coverage gaps** — largely closed: 32/34 requirements
   verified (see `REQUIREMENTS_TRACEABILITY.md`); on-hardware proof (C-5)
   remains.

## 2026-10-24 — C-2 hardening parts 4 & 5 (SSRF-derived URLs, memory-only passphrase)

**Part 4 (`6f0f721`) — `js/request-forgery` / `js/incomplete-url-substring-sanitization`.**

- The WebDAV credential probe validated its base URL but then built the request
  URL from caller-supplied `remotePath`. An **absolute** `remotePath` (e.g.
  `https://attacker/`) replaces the validated host in `new URL(targetPath, base)`,
  so a credentialed `PROPFIND` (Basic auth header) could be sent to an
  attacker-chosen host. The derived URL is now re-validated with the same
  `validateSafeUrl` policy.
- The local-Whisper probe URL is rewritten from the endpoint
  (`/transcriptions` → `/models`); the rewritten value is re-validated too.

**Part 5 (`cb04ce5`) — `js/clear-text-storage-of-sensitive-data`.**
The cloud-backup passphrase was stored in `sessionStorage` in clear text. It now
lives in memory only, and nothing derived from it is persisted (the passphrase
**length** hint is gone too — CodeQL flags derived leaks). Recorded as **D-411**.

Both verified on GitHub Actions: `verify` ×3, `format`, `Dependency Audit`,
`CodeQL`, `CodeQL Security Analysis` all green. Open alerts on `main`: **64 → 59**.

Process note: `ci.sh run` checks out `opencode/ci` _before_ committing, so a
commit made on a different branch is silently stranded (PR #71 merged an empty
branch that way). Commits are now landed on `opencode/ci` directly.

## 2026-10-24 — Guide Part II + §27 adoption (project health, supply chain, design owner)

Adopted the guide's extended practice (§15–§27) as project requirements
(**D-412**). Single app (VellumScribe), MIT, public repo; Part I unchanged.

**New repository files**

- `VISION.md`, `GOVERNANCE.md`, `CONTRIBUTORS.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `ACCESSIBILITY.md`, `ROADMAP.md` (all original wording).
- `.github/ISSUE_TEMPLATE/` — `bug.yml`, `feature.yml`, `accessibility.yml`
  (severity taxonomy), `config.yml` (private security link).
- `.github/PULL_REQUEST_TEMPLATE.md` — extended with the accessibility
  checklist and the licence note.
- `docs/design/brand.md` + `assets/brand/vellumscribe-mark.svg` (canonical mark,
  **D-413**); `docs/research/README.md` (human-gated summaries + URLs policy).

**Rewritten for a stranger**

- `README.md` — what/why/how/where, contribution pointers, quality gates,
  licence.
- `CONTRIBUTING.md` — bug/feature/setup/local-test instructions, expectations,
  response time (7 days), DCO sign-off, inbound = outbound (**D-416**).

**Supply chain (D-414)**

- `.github/workflows/security-scan.yml` — added `secret scan` (gitleaks),
  `licence scan` (`scripts/check-licenses.mjs`, denies strong-copyleft /
  source-available / NC / unlicensed), `sbom` (CycloneDX artefact).
- `scripts/check-licenses.mjs` + `npm run check:licenses`.
- `.ci-required.txt` — authoritative checks: `format`, `verify` ×3 OS,
  `secret scan`, `licence scan`, `sbom`.

**Release path**

- `.github/workflows/release.yml` — on `v*.*.*`, publishes the Release body from
  the matching `CHANGELOG.md` section; `build-apk.yml` attaches signed APKs and
  `APK-SHA256SUMS.txt` to the same Release (create-or-update, order-independent).

**Repository settings (D-415)**

- Private vulnerability reporting **enabled**.
- Branch protection on `main`: required checks above, no force-push, no
  deletion; no required human approval (rationale in D-415; Q-012).

**Design owner (D-413)**

- `.opencode/agents/designer.md` added; `orchestrator.md` delegates every
  user-visible slice to it.

**Docs**

- `docs/development.md` — flow now Chat → Task → Design → Verify → Review →
  Local test → Release; CI §7 updated to the enforced reality (lint 0, format
  enforced, new security gates, branch protection); design/other roles added.
- `docs/qc/manual-checklists.md` — added accessibility smoke test (§8), legal
  checklist (§9) and release checklist (§10).
- `docs/assumptions-and-questions.md` — Q-012…Q-018 (guide §26 conflicts and
  the employer/IP check) recorded for the owner; **not** resolved by the agent.
- `ATTRIBUTION.md` — build-time model/API terms and non-code assets documented.

**Left open for the owner (not decided by the agent):** Q-012 branch-review
requirement, Q-013 public local-test wording, Q-014 visibility, Q-015
employer/IP, Q-016 second admin + MFA, Q-017 licence expression, Q-018 metrics.

### Addendum — repository settings and gates completed same day

- **Labels** created (§17.6): `good first issue`, `help wanted`,
  `first-timers-only`, `documentation`, `accessibility`, `security`, `bug`,
  `enhancement`, `question`, `design`.
- **Secret scanning + push protection enabled** on the repository (§20.1);
  `.gitleaks.toml` allowlists only AWS's documented example key and
  `.env.example`.
- **`dependency review` job** added (PRs only, `fail-on-severity: high`,
  §20.3/§20.7); it is non-required, so it reports without blocking.
- **Action pinning:** major-version tags kept, SHA pinning recorded as a
  follow-up (**D-417**) on the launch milestone.

## 2026-10-24 — Signed release, F-Droid readiness, designer review, test coverage

**Signed APK (Q-002 resolved).** Generated a release keystore (PKCS12, alias
`vellumscribe`, valid to 2054), stored outside the repo, and set the four CI
secrets. Build run `40129841250` logged
`VELLUM: assembleRelease -> versionName=3.1.0 versionCode=30100 signed=true`.
See `docs/RELEASE_KEYSTORE.md`, D-421.

**F-Droid readiness.** Added `metadata/fdroid/metadata.yml` (+ README),
`docs/FDROID.md`, and ProGuard mapping upload in `build-apk.yml`. Confirmed FOSS
deps only, no Firebase/Play Services, all cloud/AI opt-in.

**Designer review (docs/design/review-2026-10-25.md).** Four High release
blockers fixed: H-1 light-mode contrast (`text-zinc-400` →
`text-zinc-600 dark:text-zinc-400`, 193 sites), H-2 `BatchActionBar` light-mode
colours, H-3 visible focus rings, H-4 `prefers-reduced-motion`. Medium: M-1
`AppLogo` dark-mode tile, M-2 maskable PNG/SVG wired into `public/manifest.json`.

**Test coverage.** R-1 Persistence 5/5, R-2 Notes & capture 5/5, R-3 Audio &
transcription 8/8, R-4 Security 4/5. Total **29/34** with automated tests (was
16/34). New suites: `NativeLifecycle.test.ts`, `sqliteRepository.test.ts`,
`OcrService.test.ts`, `UnlockSessionManager.test.ts`, `keystore.test.ts`,
`metricsManager.test.ts`, `OfflineAiManager.test.ts`.

**Lightweight metrics.** Opt-in, local-only usage counters (`MetricsManager`,
`metricsEnabled` privacy flag), settings toggle, wired into `NoteRepository`.

## 2026-10-26 — Addendum adoption (client mode, MCP, deterministic-test policy)

Adopted the local addendum (client-mode operating model) into repo process.
The addendum's Rust sections (§K/§M.2) do not bind this TypeScript/React repo;
their intent was already satisfied and is now documented as the binding
equivalent in `docs/development.md` §9.

- `docs/process-feedback.md` created (addendum §N append-only log); two entries:
  GitHub MCP needs a client PAT (agent cannot mint it), and the Rust gates need
  a stated non-Rust equivalent.
- MCP: `~/.config/opencode/opencode.json` created — **Context7 connected and
  verified**; GitHub MCP scaffolded but disabled pending a client PAT (all
  GitHub operations already work via the authenticated `gh` CLI).
- `docs/development.md` §9: client role model, phase status, MCP state,
  deterministic-test policy, task-brief and release-notes templates.
- PR template: tests must **name the workflow test** that proves the Task.
- Deterministic-test audit (§M.5): no real network, no sleeps; `Date.now()` used
  only for record stamps — no timing assertions. Clean.

## 2026-10-27 — Personal-data scan gate (guide §II.29) + dependency alerts cleared

Implemented the owner directive of 2026-10-27 (guide §II.29): personal data and
secrets are a mandatory scan gate, not a style issue.

- `scripts/check-personal-data.mjs`: structural patterns (absolute home paths
  other than the CI runner, Windows user paths, consumer mailbox domains,
  literal credential assignments) over the tracked tree **and the whole
  history**; an optional literal denylist arrives only through the
  `PII_DENYLIST` Actions secret, so a known personal value is never committed —
  including into the scanner itself. Every hit is reported **redacted**.
- `Security Scanning` workflow: new **personal-data scan** job; added to
  `.ci-required.txt` as a required check.
- `build-apk.yml`: tagged releases now unpack the release APK and run the same
  scan over the **built artefact** before assets are attached (§II.29.6).
- Self-tested: catches a synthetic home path, personal mailbox and credential
  (exit 1); the clean tree passes (exit 0) with 182 upstream hits correctly
  allowlisted (vendored whisper.cpp AUTHORS, sql.js Emscripten paths).
- Scan results: tree, published surface (issues/PRs: none), and metadata
  (authors are noreply/bot identities; description generic) are clean. History
  retains the maintainer OS account name in 4 commits — already removed at HEAD
  by #114/8b51224; history purge is an owner decision (see Q-020).
- Gate evidence: Security Scanning run `40581323966` (personal-data scan:
  success) on the merge commit `98420a4`; re-verified on every PR since.

Dependency alerts (owner request: "fix security and quality alerts"):

- Dependabot **10 → 1**: Dependabot's grouped security PR #117 merged (green on
  all required checks incl. the new scan): body-parser 2.4.0 (high, CVE),
  undici 8.12.3 (4×high + 1×medium), qs 6.17.0 (medium), @vitest/mocker 5.0.5
  (2×medium). Remaining `uuid` alert dismissed as `not_used` with the reason
  recorded on the alert (xcode build tooling, `uuid.v4()` only, never shipped).
- CodeQL: 7 accepted SSRF alerts (D-420) dismissed with the D-420 rationale on
  each alert — the security page now shows **0 open code-scanning alerts**.
- Secret-scanning: **0 open** (the synthetic test-fixture alert was resolved as
  `used in tests` earlier; the fixture is runtime-built).
- A one-shot "Lockfile refresh" workflow proved unnecessary after Dependabot's
  grouped PR did the resolution properly; the workflow was removed again, and
  its two failed runs were an artifact of GHA being unable to open PRs on this
  repo setting.

## 2026-10-28 — Clean-room research layer (capability inventory + gated proposals)

The owner asked whether the guide's research process (§2.3, §8.4, §II.27) had
been exercised. Honest audit: discovery and the inspiration statement existed;
**no research notes, no capability inventory, no source URLs on the Obsidian
claims**. Closed as follows:

- `docs/capability-inventory.md` created (§II.27.3): 26 capabilities, each with
  observable behaviour, acceptance criteria, and a source classified as
  `original` / `inspiration` (URL) / `standard`. The three out-of-scope
  rejections and the deferred plugin marketplace are recorded as rows.
- `docs/inspiration.md`: the four Obsidian behavioural claims now carry
  verified public URLs (all fetched, HTTP 200): How Obsidian stores data,
  Markdown editing, Internal links, Daily notes.
- Three research notes drafted as **PROPOSED** (human gate pending, per §2.3/§8.4):
  voice-ramble → structured note (audiopen.ai, otter.ai),
  transcript ↔ audio deep linking (otter.ai),
  one-tap daily voice capture (Obsidian Daily notes, voicenotes.com).
  None may be implemented until the owner approves the note.

## 2026-10-28 — §II.29.4 history purge executed; research layer re-landed

Purge (D-425, owner-approved): `git filter-repo --replace-text` (absolute home
path → `~`); all branch heads and `main` force-pushed after the owner
temporarily enabled force pushes. Fresh-clone verification: **0 history hits**
for the denylisted value on every branch; `main`'s tree identical before/after.
`PII_DENYLIST` Actions secret set — the required `personal-data scan` now
enforces the removal (redacted output). Residual: GitHub's immutable
`refs/pull/*` refs still reach old commits for PRs from 2026-10-22 → purge;
clearable only via a GitHub **Private Information Removal** request (owner).
Incident: the first force-push reused a pre-#119 mirror and briefly reverted
PRs #119/#120 from `main`; both were recovered from `refs/pull` and re-landed
in this slice (process-feedback entry 3).

Re-landed content (recovered from `refs/pull/119|120`):
`docs/capability-inventory.md`, inspiration source URLs, the three research
notes (two APPROVED per D-426), the structured-extraction provenance record in
`TranscriptViewer`, and `src/services/StructuredExtraction.test.ts` (7 tests).

## 2026-10-30 — v3.1.1 released (both APK variants), plus the audit cycle

**Release `v3.1.1`** — https://github.com/Perchemop/VellumScribe/releases/tag/v3.1.1
(created by `release.yml`; APKs attached by the `Build Android APK` tag run
`40960758092`, both legs success, `signed=true`, artefact PII scan clean):

| Asset                                            | Size      |
| ------------------------------------------------ | --------- |
| `VellumScribe-v3.1.1-real-release.apk`           | 38.7 MB   |
| `VellumScribe-v3.1.1-real-debug.apk`             | 46.0 MB   |
| `VellumScribe-v3.1.1-stub-release.apk`           | 7.3 MB    |
| `VellumScribe-v3.1.1-stub-debug.apk`             | 14.0 MB   |
| `…-real-SHA256SUMS.txt`, `…-stub-SHA256SUMS.txt` | checksums |

**Why the release exists at all:** the client reported "there is still no stub
in GitHub Actions". Root cause: every Actions run was titled `Build Android
APK`, the variant was visible only inside an artifact name, push builds were
real-only, and `v3.1.1`'s first tag run failed at the release step with
`Resource not accessible by integration` (the default token is read-only).
Fixes: `run-name` states the variant; the build job is a **matrix** and tagged
releases build **both** real and stub with per-mode named, checksummed assets;
`permissions: contents: write` lets the tag run attach them. A GitHub Release
is now the permanent, obvious download home.

**Audit cycle closed in this release** (E2E `docs/qc/e2e-audit-2026-10-29.md`,
GUI `docs/design/audit-2026-10-28-gui.md`): audio playback, encrypted backups +
working restore, persistent deletions and a real orphan sweep, theme toggle,
dialog focus containment, palette/contrast/focus fixes, and capability tests
for CAP-007/020/023. On-hardware proofs remain open
(`docs/qc/on-device-proof-3.1.1.md`).
