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
- [x] CI typecheck + test green on main (runs #234–#236 success)
- [x] Direct Google AI path requires cloud AI consent

## P1 — Write-first parity

- [x] Location picker
- [x] ReminderService wiring
- [x] Inline voice memos (AudioPlayerWidget)
- [x] Inline OCR scan list
- [x] Sketch → `sketch_media_key` binary path (MediaRepository; data-URL fallback)
- [x] Focus mode minimal chrome
- [x] Onboarding copy for + / ⋮
- [x] Recovery sheet after audio close

## P2 — Settings IA

- [x] Simple / Advanced mode toggle
- [x] Advanced-only tabs (AI, offline AI, storage, diagnostics)
- [x] Diagnostics log export + FTS rebuild (`DiagnosticsTools`)
- [ ] Conflict resolver UI (no conflict UI surface found yet; types exist)

## P3–P9

- [ ] Whisper REAL device smoke (needs device / REAL APK)
- [x] Gemini network/consent gates on primary API paths
- [ ] OAuth E2E Android
- [ ] Lower ESLint max-warnings (626 warnings remain)
- [x] README already documents limitations honestly

## Notes

- Conflict resolution: `SyncConflictRecord` exists in types; no dedicated modal wired — track as product follow-up.
- Whisper REAL: vendor tree + dual-mode CMake present; confirm on hardware after `setup:whisper` + model download.
