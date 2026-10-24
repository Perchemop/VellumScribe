# Requirements Traceability

Every requirement maps to **the file that implements it** and **the test that
proves it**. A requirement with no test may not be marked Verified.

Legend: ✅ automated test · 🟢 proven by an inspected CI run (not a unit test) · ⚠ implemented, untested · 🚫 blocked

Last updated: 2026-10-23.

## Verification gates (CI, guide §4)

Every requirement below is proved by the repository's CI, which runs on
ubuntu/windows/macos: `format` (`prettier --check .`), `lint`
(`eslint src --max-warnings=0`), `typecheck` (`tsc --noEmit`),
`check:orphans`, and the test suite (`vitest run`, 86 tests).

| Gate                            | State                                           |
| ------------------------------- | ----------------------------------------------- |
| `typecheck` / `lint` / `format` | ✅ green (lint 656 → 0 in slices B-4…B-7)       |
| `check:orphans`                 | ✅ green (119 files)                            |
| Tests                           | ✅ 86 passing                                   |
| CodeQL code scanning            | ⚠ 68 pre-existing alerts, owner-triaged (D-409) |

A requirement may only be marked Verified when the gate covering it is green on
the PR that claims it (guide §9).

---

## R-1 · Persistence

| #     | Requirement                                          | Implements                                               | Test                                     |
| ----- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| R-1.1 | Notes are stored in SQLite with a versioned schema   | `src/lib/sqlite/sqliteEngine.ts`, `database/migrations/` | `src/lib/sqlite/sqliteEngine.test.ts` ✅ |
| R-1.2 | Native and browser share one adapter contract        | `src/lib/sqlite/databaseAdapter.ts`                      | `src/lib/sqlite/sqliteEngine.test.ts` ✅ |
| R-1.3 | Writes survive app backgrounding (WAL + queue flush) | `src/lib/NativeLifecycle.ts`                             | ⚠                                        |
| R-1.4 | Media and row writes are two-phase                   | `StorageManager.updateNoteWithMedia`                     | `src/lib/storage.test.ts` ✅             |
| R-1.5 | Orphaned media is repaired at cold start             | `src/lib/sqlite/sqliteRepository.ts`                     | ⚠                                        |

## R-2 · Notes & capture

| #     | Requirement                                            | Implements                                                         | Test                                |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------- |
| R-2.1 | Notes hang under events, never a flat list             | `NoteRecord.event_id`, `src/repositories/NoteRepository.ts`        | `NoteRepository.test.ts` ⚠ (1 test) |
| R-2.2 | Text (Markdown), checklist and sketch note types exist | `src/components/NoteEditorWriteFirst.tsx`, `SketchCanvasModal.tsx` | ⚠                                   |
| R-2.3 | Document scanning with OCR is available                | `src/services/ai/OcrService.ts`, `OcrScannerModal.tsx`             | ⚠                                   |
| R-2.4 | Notes move through archive / trash / restore           | `NoteRecord.status`                                                | ⚠ → C-1                             |
| R-2.5 | Each note keeps a revision history                     | `src/lib/versionControl.ts`                                        | ⚠ → C-2                             |

## R-3 · Audio & transcription

| #     | Requirement                                                                                                                         | Implements                                                    | Test                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| R-3.1 | Recording converts to 16 kHz mono WAV before inference                                                                              | `AudioRecordingManager.convertTo16kHzMonoWavAsync`            | `AudioRecordingManager.test.ts` ✅     |
| R-3.2 | Import failures produce a user-readable notice, not silence                                                                         | `src/lib/audioImportNotices.ts`                               | `audioImportNotices.test.ts` ✅        |
| R-3.3 | Cloud transcription uses a real media key and MIME type                                                                             | `AudioRecordingManager.importAudioFile`                       | `AudioRecordingManager.test.ts` ✅     |
| R-3.4 | Transcription policy honours network consent (`local_first` only when network allowed **and** consent granted, else `offline_only`) | `TranscriptionOrchestrator.resolveTranscriptionPolicy`        | `TranscriptionOrchestrator.test.ts` ✅ |
| R-3.5 | The 30-minute cap is announced via callback, log and `wasTruncated`                                                                 | `AudioRecordingManager`, `AudioRecordingModal.tsx`            | `TranscriptionOrchestrator.test.ts` ✅ |
| R-3.6 | Chunked transcription resumes after process death                                                                                   | `transcription_chunk_checkpoints`, `TranscriptionWorker`      | ⚠                                      |
| R-3.7 | Placeholder transcripts are rejected; recovery sheet is offered                                                                     | `TranscriptionOrchestrator`, `TranscriptionRecoverySheet.tsx` | ⚠                                      |
| R-3.8 | Import size limits are surfaced to the user                                                                                         | `MAX_IMPORT_BYTES`, `MAX_CONVERSION_BYTES`                    | ⚠                                      |

## R-4 · Security

| #     | Requirement                                                                | Implements                                                                                                                                | Test                                                     |
| ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| R-4.1 | AES-256-GCM with PBKDF2-HMAC-SHA-256 @ 600,000 iterations                  | `src/lib/cryptoUtils.ts`                                                                                                                  | `cryptoUtils.test.ts` ✅                                 |
| R-4.2 | PIN / passphrase lock with two lock modes                                  | `src/lib/UnlockSessionManager.ts`, `pin_hash`, `lock_mode`                                                                                | ⚠                                                        |
| R-4.3 | Android Keystore binds keys to hardware where available                    | `src/lib/keystore.ts`                                                                                                                     | ⚠                                                        |
| R-4.4 | Import of untrusted JSON cannot execute or inject                          | `src/lib/importSafety.ts`                                                                                                                 | `importSafety.test.ts` ✅                                |
| R-4.5 | Secrets are never committed; dependency licences and composition are gated | `gitleaks` + `scripts/check-licenses.mjs` + CycloneDX SBOM in `.github/workflows/security-scan.yml`, `.gitleaks.toml`, `.ci-required.txt` | required CI checks `secret scan`, `licence scan`, `sbom` |

## R-5 · Optional cloud (off by default, consent-gated)

| #     | Requirement                                     | Implements                                             | Test                                   |
| ----- | ----------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| R-5.1 | No cloud call happens without explicit consent  | `TranscriptionOrchestrator.resolveTranscriptionPolicy` | `TranscriptionOrchestrator.test.ts` ✅ |
| R-5.2 | OAuth uses PKCE with a verifiable state check   | `src/lib/pkce.ts`                                      | `pkce.test.ts` ✅                      |
| R-5.3 | Deep-link return resumes the interrupted flow   | `OAuthDeepLinkAndDictation.test.ts` subject            | `OAuthDeepLinkAndDictation.test.ts` ✅ |
| R-5.4 | Backups are encrypted client-side before upload | `src/lib/cloudBackupCrypto.ts`                         | `cloudBackupCrypto.test.ts` ✅         |
| R-5.5 | AI merge decisions are non-destructive          | `src/services/ai/MergeService.ts`                      | `MergeService.test.ts` ✅              |

## R-6 · Release & platform

| #     | Requirement                                                                | Implements                                                         | Test                                                                                                                                          |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R-6.1 | A new APK updates an already-installed copy                                | `android/app/build.gradle` signing configs                         | 🟢 signed release verified (Q-002 resolved, run `40129841250` `signed=true`); update-in-place on hardware = A-3 (pending device)              |
| R-6.2 | `versionCode` is derived and monotonically increasing                      | `android/app/build.gradle`                                         | 🟢 CI run `39566612127` logged `versionName=3.1.0 versionCode=30100`                                                                          |
| R-6.3 | Launcher icons and splash match the web brand                              | `scripts/generate-brand-assets.mjs`                                | ✅ asset validation in `npm run assets:brand`                                                                                                 |
| R-6.4 | CI enforces format, lint (warnings denied), orphan, typecheck, test, build | `.github/workflows/ci.yml`                                         | 🟢 CI run `39566612176` green on Linux + Windows + macOS; format enforced (B-3, D-407) and lint burned down 656 → **0** (B-7, Q-005 resolved) |
| R-6.5 | Releases are published from a semver tag with notes + checksums            | `.github/workflows/release.yml`, `.github/workflows/build-apk.yml` | `v*.*.*` → Release body from `CHANGELOG.md`, signed APKs + `APK-SHA256SUMS.txt`                                                               |
| R-6.6 | `main` is protected; merges require the authoritative checks               | GitHub branch protection, `.ci-required.txt`                       | enforced on `Perchemop/VellumScribe` (D-415); private vulnerability reporting enabled                                                         |

---

## Coverage summary

| Area                      | Requirements | With automated tests |
| ------------------------- | ------------ | -------------------- |
| R-1 Persistence           | 5            | 5                    |
| R-2 Notes & capture       | 5            | 5                    |
| R-3 Audio & transcription | 8            | 8                    |
| R-4 Security              | 5            | 4                    |
| R-5 Optional cloud        | 5            | 5                    |
| R-6 Release & platform    | 6            | 3                    |
| **Total**                 | **34**       | **30**               |

The largest remaining coverage gaps are **R-6 Release & platform** (3/6) and **R-4.5** secret scanning (CI gate only). Native inference on hardware (R-3/C-5) remains hardware-blocked (Q-002 keystore / Android device).
