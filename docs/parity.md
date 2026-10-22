# Parity / Capability Tracker

Living tracker. Every in-scope capability from `docs/scope.md` carries a status.

| Status | Meaning |
| --- | --- |
| **Inspired** | Design exists on paper only; no code yet. |
| **Implemented** | Code exists and is reachable in the app. |
| **Verified** | Automated test(s) cover the behaviour. |
| **Polished** | Verified *and* reviewed for UX, performance and edge cases. |

A capability may only be called **Verified** when a named test proves it.
"Implemented" alone is never a release claim.

Last reviewed: 2026-10-21. Test suite: **12 files / 86 tests**, all passing.

---

## Persistence & data

| Capability | Status | Evidence |
| --- | --- | --- |
| SQLite schema + migrations (`vellumscribeSQLite.db`, schema v12) | Implemented | `src/lib/sqlite/sqliteEngine.ts`, `database/migrations/` |
| Dual adapter: native SQLite / `sql.js` WASM | Implemented | `src/lib/sqlite/databaseAdapter.ts` |
| WAL checkpoint + queue flush on background | Implemented | `src/lib/NativeLifecycle.ts` |
| Two-phase media + row writes | Implemented | `StorageManager.updateNoteWithMedia` |
| Cold-start orphaned-media repair | Implemented | `src/lib/sqlite/sqliteRepository.ts` |
| Storage gateway behaviour | **Polished** | `src/lib/storage.test.ts` (20 tests) |
| SQLite engine behaviour | **Polished** | `src/lib/sqlite/sqliteEngine.test.ts` (6 tests) |
| Note repository | Implemented | `src/repositories/NoteRepository.test.ts` (1 test) — thin |

## Notes & capture

| Capability | Status | Evidence |
| --- | --- | --- |
| Events as the organising unit | Implemented | `EventRecord` in `src/types.ts`, `EventNotesList.tsx` |
| Notes under events (never a flat list) | Implemented | `NoteRecord.event_id` enforced in `NoteRepository` |
| Text (Markdown) notes | Implemented | `NoteEditorWriteFirst.tsx` |
| Checklist notes | Implemented | checklist editors |
| Sketch notes | Implemented | `SketchCanvasModal.tsx` (lazy) |
| Document scan (OCR) | Implemented | `OcrScannerModal.tsx` (lazy) |
| Reminders, geotags, colour labels | Implemented | `ReminderService`, `NoteRecord` fields |
| Archive / trash lifecycle | Implemented | `NoteRecord.status` |
| Version history / revisions | Implemented | `src/lib/versionControl.ts`, `NoteRevisionsModal.tsx` |
| Batch actions | Implemented | `BatchActionBar.tsx` |
| Virtualised note list | Implemented | `react-window` via `VirtualizedNotesList.tsx` |
| Note editor behaviour | Implemented | `NoteEditorWriteFirst.tsx` — **no automated test** |

## Audio & transcription

| Capability | Status | Evidence |
| --- | --- | --- |
| Recording → 16 kHz mono WAV conversion | Implemented | `AudioRecordingManager.convertTo16kHzMonoWavAsync` |
| On-device Whisper (REAL native build) | Implemented | `android/app/src/main/cpp/` (dual-mode JNI, fail-closed stub) |
| Live dictation fallback (OS / browser) | Implemented | `AudioRecordingManager` + `OfflineAiManager` |
| Resumable chunked transcription | Implemented | `transcription_chunk_checkpoints`, `TranscriptionWorker` |
| Honest engine reporting (no placeholder transcripts) | Implemented | `TranscriptionOrchestrator.resolveTranscriptionPolicy` |
| Engine provenance badges | Implemented | `AudioPlayerWidget.tsx` |
| Recovery sheet on real failure | Implemented | `TranscriptionRecoverySheet.tsx` (lazy) |
| Import size / duration limits surfaced to the user | Implemented | `src/lib/audioImportNotices.ts` |
| Import pipeline behaviour | **Polished** | `AudioRecordingManager.test.ts` (11 tests); the recording modal has no dedicated test |
| Engine policy resolution | **Polished** | `TranscriptionOrchestrator.test.ts` (7 tests) |
| Import notice copy | **Polished** | `audioImportNotices.test.ts` (4 tests) |
| Native REAL inference on a physical device | Implemented | **Not verified** — needs a device + signed APK |

## Security

| Capability | Status | Evidence |
| --- | --- | --- |
| AES-256-GCM, PBKDF2-HMAC-SHA-256 @ 600k | **Polished** | `src/lib/cryptoUtils.test.ts` (12 tests) |
| PIN / passphrase, two lock modes | Implemented | `pin_hash`, `lock_mode`, `security_type` |
| Session lifetime control | Implemented | `UnlockSessionManager.ts` |
| Android Keystore binding | Implemented | `src/lib/keystore.ts` |
| Safe JSON import | **Polished** | `src/lib/importSafety.test.ts` (6 tests) |

## Cloud (optional, consent-gated)

| Capability | Status | Evidence |
| --- | --- | --- |
| Encrypted backup / restore | Implemented | `CloudConnectModal.tsx`, `src/lib/cloudBackupCrypto.ts` |
| OAuth PKCE flow | **Polished** | `src/lib/pkce.test.ts` (4 tests) |
| OAuth deep link return + dictation handoff | **Polished** | `OAuthDeepLinkAndDictation.test.ts` (7 tests) |
| Gemini summaries (user's own key) | Implemented | `src/services/ai/SummaryService.ts` |
| OCR parsing | Implemented | `src/services/ai/OcrService.ts` |
| AI merge behaviour | **Polished** | `MergeService.test.ts` (4 tests) |
| NotebookLM adapter | **Polished** | `notebooklm/adapter.test.ts` (4 tests) |

## Release & platform

| Capability | Status | Evidence |
| --- | --- | --- |
| Signed APK able to update an installed copy | Implemented | `android/app/build.gradle`; CI build reports `signed=false` — **blocked on Q-002** (no keystore) |
| Derived `versionCode` from `package.json` | **Verified** | CI run `39566612127`: `versionName=3.1.0 versionCode=30100` logged for both `assembleDebug` and `assembleRelease` |
| APK build in CI (debug + release) | **Verified** | CI run `39566612127` green; artifact `VellumScribe-Android-APKs-real` |
| Brand-consistent launcher icons + splash | **Polished** | `npm run assets:brand`; 26 PNGs + 11 XMLs validated |
| PWA manifest + brand favicon | **Polished** | `public/manifest.json`, `public/favicon.svg` |
| CI verification signal | **Verified (pre-flip)** | CI run `39566612176` green on Linux + Windows + macOS; Security Scanning `39566612217` green. Re-verified after each lint burn-down slice. |
| Lint gate — warnings denied (`--max-warnings=0`) | **Failing until burn-down** | 656 pre-existing warnings fail CI lint — active blocker Q-005; burn down via `ci.sh` iterations (guide §4). |

---

## Gaps to close

1. **No automated tests for:** reminders/geotags, archive/trash lifecycle,
   version history, checklist editing, sketch canvas, OCR parsing, backup
   restore, and the Android media-key recovery path.
2. **Native inference is unverified on hardware** — requires a signed APK and
   a physical `arm64` device.
3. ~~**CI is down**~~ — **resolved 2026-10-21.** CI, Security Scanning and
   the Android APK workflow all run green. The release blocker is now the
   missing signing key (Q-002).
4. **Lint gate denies warnings** (`--max-warnings=0`, guide §4) — **currently
   failing** on 656 pre-existing warnings (Q-005, active blocker #1). Burn
   down via `ci.sh` iterations; CI lint must be green before any slice claims
   Done.
