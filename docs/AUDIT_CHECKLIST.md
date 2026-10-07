# VellumScribe audit checklist

Track audit findings on `main`.

## P0 — Correctness / security

- [x] Write-first primary bar + Attach / More
- [x] Modal prop alignment (OCR, audio, security, AI)
- [x] Draft recovery banner + aria-live
- [x] No plaintext drafts for locked notes
- [x] Locked-note UI gate
- [x] NoteEditorWriteFirst restored after accidental empty push (2026-10-07)
- [x] TranscriptionRecoverySheet `isOpen` prop
- [ ] `saveUnlockedNote` / re-encrypt path after unlock
- [x] Remove materialize artifacts (earlier)
- [ ] CI typecheck + test green on latest main

## P1 — Write-first parity

- [x] Location picker
- [x] ReminderService wiring
- [~] Inline recordings / OCR list (was in full editor; re-add after restore)
- [ ] Sketch → `sketch_media_key` binary path
- [x] Focus mode minimal chrome
- [x] Onboarding copy for + / ⋮
- [x] Recovery sheet after audio close

## P2 — Settings IA

- [ ] Simple / Advanced mode toggle (workflow prepared; needs successful Actions run)
- [ ] Advanced-only tabs
- [ ] Conflict resolver UI
- [ ] Diagnostics log export + FTS rebuild

## P3–P9

- [ ] Whisper REAL device smoke
- [ ] All Gemini entry points privacy-gated
- [ ] OAuth E2E Android
- [ ] Lower ESLint max-warnings
- [ ] Honest README / Play STT claims

See `docs/AUDIT_IMPROVEMENTS.md`.
