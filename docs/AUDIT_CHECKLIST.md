# VellumScribe audit checklist

Track audit findings on `main`. Update when items ship.

## P0 — Correctness / security

- [x] Write-first primary bar + Attach / More
- [x] Modal prop alignment (OCR, audio, security, AI)
- [x] Draft recovery banner
- [x] No plaintext drafts for locked notes
- [x] Locked-note UI gate
- [ ] `saveUnlockedNote` / re-encrypt path after unlock
- [x] Remove materialize artifacts
- [ ] CI typecheck + test green on latest main

## P1 — Write-first parity

- [x] Location picker
- [x] ReminderService wiring
- [x] Inline recordings / OCR list under body
- [ ] Sketch → `sketch_media_key` binary path
- [x] Focus mode minimal chrome (Done)
- [ ] Onboarding copy for + / ⋮
- [x] Draft banner `aria-live`
- [x] Transcription recovery sheet after audio (isOpen API)

## P2 — Settings IA

- [x] Simple / Advanced mode toggle
- [x] Advanced-only tabs: AI, offline AI, storage, diagnostics
- [ ] Conflict resolver UI
- [ ] Diagnostics: log export + FTS rebuild controls

## P3–P9 (summary)

- [ ] Whisper REAL device smoke
- [ ] All Gemini entry points privacy-gated
- [ ] OAuth E2E Android
- [ ] Lower ESLint max-warnings
- [ ] Honest README / Play STT claims

See also `docs/AUDIT_IMPROVEMENTS.md`.
