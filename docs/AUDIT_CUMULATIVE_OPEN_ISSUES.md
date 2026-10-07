# Cumulative open issues — all audit / review sections

Last updated after: write-first UI, SSO shell, transcription, cloud crypto deep-dives.

Legend: **D** = device/ops · **P** = product/code · **U** = UX polish · **L** = lint/hygiene

---

## A. Device / ops (blocked without hardware or secrets)

| ID | Severity | Section | Issue | Status |
|----|----------|---------|-------|--------|
| D-01 | High | Whisper | Build REAL `libwhisper` APK, install model, smoke offline STT | Open |
| D-02 | High | SSO | Configure `GOOGLE_*` / `MICROSOFT_*` env; Android OAuth E2E with deep link / App Links | Open |
| D-03 | Med | SSO | Publish production `assetlinks.json` for verified HTTPS App Links | Open |
| D-04 | Med | Audio | OEM SpeechRecognizer language packs required for live dictation quality | Open |
| D-05 | Low | Sync | End-to-end cloud backup upload/restore on real Drive/OneDrive/WebDAV | Open |

---

## B. Product / code (in-repo remaining)

| ID | Severity | Section | Issue | Status |
|----|----------|---------|-------|--------|
| P-01 | Med | Transcription | `AudioRecordingModal` calls `OfflineAiManager.transcribeRecording` directly — **bypasses** `TranscriptionOrchestrator`, so **live dictation text is not used** when Whisper fails | Open — recommended fix |
| P-02 | Med | Cloud crypto | No guided **user passphrase / key export** for multi-device restore of encrypted backups | Open |
| P-03 | Low | Settings | `settingsSubtab` type in App omits `offline-ai` / `about` (runtime cast works) | Open polish |
| P-04 | Low | Sync | Sync queue aborts remaining items on first network error; no exponential backoff | Open |
| P-05 | Low | Transcription | Ensure every offline record path persists `liveCapturedText` on the recording entity for recovery | Open (related to P-01) |

**Recently closed (this cycle):**

- Cloud Gemini consent on orchestrator engine
- Recovery sheet `media_key` + consent + `recordingId` wiring
- Capability fallback sets `inferenceRuntimeReady: false`
- Global OAuth `appUrlOpen` listener in App
- Write-first editor, draft/lock, sketch hydration, conflict panel, etc. (see `AUDIT_CHECKLIST.md`)

---

## C. UX polish (non-blocking)

| ID | Severity | Section | Issue | Status |
|----|----------|---------|-------|--------|
| U-01 | Low | Shell | Desktop Settings button + “Settings & AI” tab redundancy | Open |
| U-02 | Low | List | `EventNotesList` still dense (~48KB); progressive disclosure for power actions | Open (PRD backlog) |
| U-03 | Low | Settings | SettingsView remains large; further panel extraction | Open |
| U-04 | Low | Recording | Modal claims “On-Device AI” even when only STUB Whisper is linked — align copy with capability flags | Open |

---

## D. Lint / hygiene

| ID | Severity | Section | Issue | Status |
|----|----------|---------|-------|--------|
| L-01 | Low | CI | ESLint warnings budget 620 (~615); ratchet toward 0 | Ongoing |

---

## E. Sections reviewed (complete for in-repo scope)

| Section | Doc | Residual |
|---------|-----|----------|
| Write-first / editor chrome | AUDIT_CHECKLIST P0–P1 | Device only |
| Settings IA | AUDIT_CHECKLIST P2 | U-03 |
| SSO / App shell | AUDIT_SECTION_SSO_AND_SHELL.md | D-02, D-03 |
| Transcription pipeline | AUDIT_SECTION_TRANSCRIPTION.md | D-01, P-01, P-05, U-04 |
| Cloud backup crypto | AUDIT_SECTION_CLOUD_CRYPTO.md | P-02, P-04, D-05 |

---

## F. Recommended next implementation order

1. **P-01** — Route `AudioRecordingModal` stop path through `TranscriptionOrchestrator` with `liveCapturedText: liveTranscript` and `policy: 'local_first'` (fallback cloud only if allowed).
2. **U-04** — Capability-aware labels in recording / recovery UI.
3. **P-02** — Optional backup passphrase in Settings → Cloud (encrypt with user phrase; document restore).
4. **D-01 / D-02** — Hardware validation.
5. **L-01** — Lint ratchet.

---

## G. Explicitly out of scope for pure code agents

- Physical APK install and microphone tests
- Production OAuth client secrets and Google/Microsoft console config
- Digital Asset Links hosting for the production domain
