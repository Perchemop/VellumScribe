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
- [x] Remove orphaned `AudioRecorderPlayer` + `audioRecorder` shim (CI orphans)
- [ ] CI typecheck + test green on latest main (verify after orphans fix)

## P1 — Write-first parity

- [x] Location picker
- [x] ReminderService wiring
- [x] Inline voice memos (AudioPlayerWidget)
- [x] Inline OCR scan list
- [ ] Sketch → `sketch_media_key` binary path
- [x] Focus mode minimal chrome
- [x] Onboarding copy for + / ⋮
- [x] Recovery sheet after audio close

## P2 — Settings IA

- [x] Simple / Advanced mode toggle
- [x] Advanced-only tabs (AI, offline AI, storage, diagnostics)
- [ ] Conflict resolver UI
- [ ] Diagnostics log export + FTS rebuild

## P3–P9

- [ ] Whisper REAL device smoke
- [ ] All Gemini entry points privacy-gated
- [ ] OAuth E2E Android
- [ ] Lower ESLint max-warnings
- [ ] Honest README / Play STT claims
