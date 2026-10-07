# VellumScribe audit checklist

Track audit findings on `main`.

## P0 — Correctness / security

- [x] Write-first primary bar + Attach / More
- [x] Modal prop alignment (OCR, audio, security, AI)
- [x] Draft recovery banner + aria-live
- [x] No plaintext drafts for locked notes
- [x] Locked-note UI gate
- [x] NoteEditorWriteFirst restored + PR #48 reimplemented
- [x] TranscriptionRecoverySheet `isOpen` prop
- [x] AI provenance badge next to title
- [x] Audio playback strip (`AudioPlayerWidget`) for note memos
- [x] `saveUnlockedNote` path while session PIN held after unlock
- [x] Apply decrypted payload via `onUnlockSession`
- [x] Remove orphaned `AudioRecorderPlayer` + `audioRecorder` shim
- [x] CI typecheck + test green on main
- [x] Direct Google AI path requires cloud AI consent

## P1 — Write-first parity

- [x] Location picker
- [x] ReminderService wiring
- [x] Inline voice memos (AudioPlayerWidget)
- [x] Inline OCR scan list
- [x] Sketch → `sketch_media_key` binary path
- [x] Focus mode minimal chrome
- [x] Onboarding copy for + / ⋮
- [x] Recovery sheet after audio close

## P2 — Settings IA

- [x] Simple / Advanced mode toggle
- [x] Advanced-only tabs
- [x] Diagnostics log export + FTS rebuild (`DiagnosticsTools`)
- [x] Conflict resolver UI (`ConflictResolverPanel` + `resolveSyncConflict`)

## P3–P9

- [ ] Whisper REAL device smoke (needs device / REAL APK)
- [x] Gemini network/consent gates on primary API paths
- [ ] OAuth E2E Android
- [x] Lower ESLint max-warnings (650 → 620; continue ratcheting)
- [x] README documents limitations honestly

## Device / ops (cannot complete in CI alone)

- [ ] Whisper REAL NDK build + model download smoke on hardware
- [ ] OAuth App Links E2E (Google / Microsoft) on Android
- [ ] Further ESLint warning cleanup toward 0
