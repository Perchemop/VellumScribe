# Parity / Capability Tracker

Living tracker. Every in-scope capability from `docs/scope.md` carries a status.

| Status          | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| **Inspired**    | Design exists on paper only; no code yet.                   |
| **Implemented** | Code exists and is reachable in the app.                    |
| **Verified**    | Automated test(s) cover the behaviour.                      |
| **Polished**    | Verified _and_ reviewed for UX, performance and edge cases. |

A capability may only be called **Verified** when a named test proves it.
"Implemented" alone is never a release claim.

Last reviewed: 2026-10-31. Unit-test suite: **31 `*.test.ts(x)` files under
`src/`** (plus the `tests/visual.spec.ts` rendered-evidence specs); the
2026-10-21 "12 files / 86 tests" figure is historical — pass counts come from
CI runs.

---

## Persistence & data

| Capability                                                       | Status       | Evidence                                                 |
| ---------------------------------------------------------------- | ------------ | -------------------------------------------------------- |
| SQLite schema + migrations (`vellumscribeSQLite.db`, schema v12) | Implemented  | `src/lib/sqlite/sqliteEngine.ts`, `database/migrations/` |
| Dual adapter: native SQLite / `sql.js` WASM                      | Implemented  | `src/lib/sqlite/databaseAdapter.ts`                      |
| WAL checkpoint + queue flush on background                       | **Verified** | `src/lib/NativeLifecycle.test.ts` (R-1.3)                |
| Two-phase media + row writes                                     | Implemented  | `StorageManager.updateNoteWithMedia`                     |
| Cold-start orphaned-media repair                                 | **Verified** | `src/lib/sqlite/sqliteRepository.test.ts` (R-1.5)        |
| Storage gateway behaviour                                        | **Polished** | `src/lib/storage.test.ts` (20 tests)                     |
| SQLite engine behaviour                                          | **Polished** | `src/lib/sqlite/sqliteEngine.test.ts` (6 tests)          |
| Note repository                                                  | **Verified** | `NoteRepository*.test.ts` (item_changes + lifecycle)     |

## Notes & capture

| Capability                             | Status       | Evidence                                              |
| -------------------------------------- | ------------ | ----------------------------------------------------- |
| Events as the organising unit          | Implemented  | `EventRecord` in `src/types.ts`, `EventNotesList.tsx` |
| Notes under events (never a flat list) | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.1)            |
| Text (Markdown) notes                  | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.2)            |
| Checklist notes                        | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.2)            |
| Sketch notes                           | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.2)            |
| Document scan (OCR)                    | **Verified** | `OcrService.test.ts` (R-2.3)                          |
| Reminders, geotags, colour labels      | Implemented  | `ReminderService`, `NoteRecord` fields                |
| Archive / trash lifecycle              | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.4)            |
| Version history / revisions            | **Verified** | `NoteRepository.lifecycle.test.ts` (R-2.5)            |
| Batch actions                          | Implemented  | `BatchActionBar.tsx`                                  |
| Virtualised note list                  | Implemented  | `react-window` via `VirtualizedNotesList.tsx`         |
| Note editor behaviour                  | Implemented  | `NoteEditorWriteFirst.tsx` — **no automated test**    |

## Audio & transcription

| Capability                                           | Status       | Evidence                                                                              |
| ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Recording → 16 kHz mono WAV conversion               | **Verified** | `AudioRecordingManager.test.ts` (R-3.1)                                               |
| On-device Whisper (REAL native build)                | Implemented  | `android/app/src/main/cpp/` (dual-mode JNI, fail-closed stub)                         |
| Live dictation fallback (OS / browser)               | Implemented  | `AudioRecordingManager` + `OfflineAiManager`                                          |
| Resumable chunked transcription                      | **Verified** | `OfflineAiManager.test.ts` (R-3.6 crash recovery)                                     |
| Honest engine reporting (no placeholder transcripts) | **Verified** | `TranscriptionOrchestrator.test.ts` (R-3.4/R-3.7)                                     |
| Engine provenance badges                             | Implemented  | `AudioPlayerWidget.tsx`                                                               |
| Recovery sheet on real failure                       | Implemented  | `TranscriptionRecoverySheet.tsx` (lazy)                                               |
| Import size / duration limits surfaced to the user   | **Verified** | `audioImportNotices.test.ts` + `AudioRecordingManager.test.ts` (R-3.8)                |
| Import pipeline behaviour                            | **Polished** | `AudioRecordingManager.test.ts` (11 tests); the recording modal has no dedicated test |
| Engine policy resolution                             | **Polished** | `TranscriptionOrchestrator.test.ts` (7 tests)                                         |
| Import notice copy                                   | **Polished** | `audioImportNotices.test.ts` (4 tests)                                                |
| Native REAL inference on a physical device           | Implemented  | **Not verified** — needs a device; signed APKs ship since `v3.1.1`                    |

## Security

| Capability                              | Status       | Evidence                                 |
| --------------------------------------- | ------------ | ---------------------------------------- |
| AES-256-GCM, PBKDF2-HMAC-SHA-256 @ 600k | **Polished** | `src/lib/cryptoUtils.test.ts` (12 tests) |
| PIN / passphrase, two lock modes        | **Verified** | `UnlockSessionManager.test.ts` (R-4.2)   |
| Session lifetime control                | **Verified** | `UnlockSessionManager.test.ts`           |
| Android Keystore binding                | **Verified** | `src/lib/keystore.test.ts` (R-4.3)       |
| Safe JSON import                        | **Polished** | `src/lib/importSafety.test.ts` (6 tests) |

## Cloud (optional, consent-gated)

| Capability                                 | Status       | Evidence                                                   |
| ------------------------------------------ | ------------ | ---------------------------------------------------------- |
| Encrypted backup / restore                 | **Verified** | `cloudBackupCrypto.test.ts` + `cloudBackupArchive.test.ts` |
| OAuth PKCE flow                            | **Polished** | `src/lib/pkce.test.ts` (4 tests)                           |
| OAuth deep link return + dictation handoff | **Polished** | `OAuthDeepLinkAndDictation.test.ts` (7 tests)              |
| Gemini summaries (user's own key)          | Implemented  | `src/services/ai/SummaryService.ts`                        |
| OCR parsing                                | **Verified** | `OcrService.test.ts`                                       |
| AI merge behaviour                         | **Polished** | `MergeService.test.ts` (4 tests)                           |
| NotebookLM adapter                         | **Polished** | `notebooklm/adapter.test.ts` (4 tests)                     |

## Release & platform

| Capability                                       | Status               | Evidence                                                                                                                                     |
| ------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed APK able to update an installed copy      | Implemented          | signed release proven in CI (`signed=true`); signed APKs ship on Release `v3.1.1`; update-in-place on hardware unproven (A-3)                |
| Derived `versionCode` from `package.json`        | **Verified**         | CI run `39566612127`: `versionName=3.1.0 versionCode=30100` logged for both `assembleDebug` and `assembleRelease`                            |
| APK build in CI (debug + release)                | **Verified**         | CI run `39566612127` green; artifact `VellumScribe-Android-APKs-real`                                                                        |
| Brand-consistent launcher icons + splash         | **Polished**         | `npm run assets:brand`; 26 PNGs + 11 XMLs validated                                                                                          |
| PWA manifest + brand favicon                     | **Polished**         | `public/manifest.json`; favicon + maskable now generated from the canonical mark (2026-10-31 slice, pending CI)                              |
| CI verification signal                           | **Verified**         | CI run `39566612176` green on Linux + Windows + macOS; `format` required since B-3 (D-407); secret/personal-data/licence/SBOM scans required |
| Lint gate — warnings denied (`--max-warnings=0`) | **Enforced — green** | lint burned down 656 → 0 in B-4…B-7 (Q-005 resolved); warnings remain denied                                                                 |

---

## Gaps to close

1. **Still without automated tests:** reminders/geotags, checklist editing UI,
   sketch canvas, note-editor behaviour, and the Android media-key recovery
   path. (Archive/trash, version history, OCR parsing, backup restore,
   session/keystore and the storage lifecycle gained suites through
   2026-10-30.)
2. **Native inference is unverified on hardware** — requires a physical
   `arm64` device (signed release APKs are available since `v3.1.1`).
3. ~~**CI is down**~~ — **resolved 2026-10-21.** CI, Security Scanning and
   the Android APK workflow all run green. (Q-002 has since been resolved
   too — signed APKs ship since `v3.1.1`.)
4. ~~**Lint gate denies warnings**~~ — **resolved** in B-4…B-7 (2026-10-23):
   656 → 0; `--max-warnings=0` is enforced and green.
5. **Rendered visual evidence is partial:** transcript viewer, modals, error
   and focused states have no captures; the 2026-10-31 polish slice adds
   About, bottom-nav, delete-confirmation, forced-colours and theme captures
   (pending CI).
