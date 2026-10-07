# Audit improvements status (v3.1 write-first)

Tracks cumulative audit items applied on `main`.

## Done (P0 / P1)

| Item | Status | Notes |
|------|--------|-------|
| Write-first primary bar + Attach/More | Done | `NoteEditorChrome` |
| Modal prop alignment (OCR, audio, security, AI) | Done | Lazy modals in `NoteEditorWriteFirst` |
| Draft recovery banner | Done | `DraftStore.findNewerDraft` + Restore/Discard |
| No plaintext drafts for locked notes | Done | `DraftStore.write` skipped when `is_locked` |
| Locked-note edit gate | Done | Unlock wall until `NoteSecurityModal` succeeds |
| Location picker | Done | GPS + custom label strip |
| Reminder → `ReminderService` | Done | schedule / cancel on change |
| Cloud AI consent grant on confirm | Done | `PrivacyManager.grantCloudAiConsent()` |
| Remove materialize payload / workflow | Done | Incomplete b64 push artifacts |

## Still open

| Item | Priority |
|------|----------|
| Full `saveUnlockedNote` encrypt path after unlock (session PIN) | P0 residual |
| Inline recordings / OCR scan list under body | P1 |
| Settings Simple / Advanced split | P2 |
| Transcription recovery sheet in audio exit path | P3 |
| Onboarding copy updated for Attach/More | P1 |
| Lower ESLint `max-warnings` | P6 |
| Device smoke: Whisper REAL + model | P3 / P9 |

## Verify locally

```bash
npm run typecheck
npm test
npm run lint
```
