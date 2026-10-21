# Scope

Confirmed with the project owner on 2026-10-21 during guide adoption
discovery. Anything not listed here is **not** silently in scope — see
`docs/assumptions-and-questions.md` for the undecided items.

---

## Platform scope (deliberately narrowed)

The guide's default is "all practical platforms". The owner explicitly
narrowed this, which is permitted by the guide and recorded here as a decision
(`DECISIONS.md` D-002):

| Platform | Status |
| --- | --- |
| Android (Capacitor APK) | **In scope** — primary target |
| Web (Vite SPA / PWA assets) | **In scope** — secondary target, also the shell that Capacitor packages |
| Windows / macOS / Linux | Out of scope for the next major version |
| iOS | Out of scope for the next major version |
| Bundled WASM engine (server-less desktop) | Out of scope for the next major version |

---

## In scope

### Foundation
- TypeScript + React 19 app surface, Vite build, Tailwind v4.
- Capacitor 8 Android shell, `arm64-v8a` only.
- SQLite persistence with schema migrations (`vellumscribeSQLite.db` natively,
  `sql.js` WASM in the browser) behind a single `DatabaseAdapter`.
- Optimistic UI via `StorageManager` as the authoritative gateway.

### Capture & notes
- **Events** as the organising unit (`EventRecord`: title, date, description,
  location, category, colour).
- **Notes under events** (`NoteRecord.event_id`), never a flat list.
- Note types: text (Markdown), checklist, sketch.
- Media capture: audio recording, document scan (OCR), images.
- Reminders, geotags, archive / trash lifecycle, colour labels.
- Version history / revisions per note.

### Search & retrieval
- SQLite FTS over notes, checklists and transcripts.

### Security
- Optional PIN or passphrase lock.
- AES-256-GCM with PBKDF2-HMAC-SHA-256 at 600,000 iterations.
- Two lock modes: `standard` (body/attachments) and `private` (metadata masked
  too).
- Session lifetime control via `UnlockSessionManager`.

### Transcription
- On-device Whisper (REAL native build; fail-closed stub when the upstream
  tree is absent).
- Live dictation via OS `SpeechRecognizer` / Web Speech API as the
  zero-download path.
- Resumable chunked transcription with durable checkpoints so process death
  does not lose or duplicate work.
- Honest engine reporting: provenance badges, `inferenceRuntimeReady`
  gating, rejection of placeholder text, explicit recovery sheet on failure.

### Durability
- WAL checkpoint + queue flush on background.
- Two-phase media/row writes.
- Cold-start orphaned-media repair.

### Optional cloud (consent-gated, off by default)
- Encrypted backup and restore: Google Drive, OneDrive, WebDAV.
- Gemini AI summaries using the user's own API key.

### Release & process
- Signed release APK that can update an already-installed copy.
- CI as the primary verification signal (format check, lint, tests, build).
- Tracking files required by the guide (this document set).

---

## Explicitly out of scope

Confirmed by the owner on 2026-10-21:

| Capability | Why it is out |
| --- | --- |
| **Real-time collaboration** | Requires a server, presence and conflict resolution — the opposite of the offline-first, no-account premise. |
| **Multi-user / teams** | Same reason: multi-tenancy, invites and shared workspaces need accounts and a server. |
| **Open-ended AI chat** | The product offers *bounded* AI actions (a summary of a specific note, a transcription of specific audio). A free-form chat assistant is a different product and would undermine the "no cloud unless you ask" promise. |
| **Continuous cross-device sync** | The product has encrypted backup-and-restore. Live sync (conflict resolution, multi-device presence) is a different, server-shaped feature and is out of scope for this major version. |

These are recorded so that no one silently adds them later. Adding any of them
requires an explicit scope change recorded in this file *and* a decision in
`DECISIONS.md`.

---

## Inspired but not yet decided

Listed honestly as **undecided**, not as in or out of scope:

- Plugin marketplace / user-installable extensions. **Deferred to a later
  phase** by the owner (2026-10-21): "plugin can wait until later in the
  project". Not rejected — deliberately not decided for this major version.

See `docs/assumptions-and-questions.md` Q-006 and Q-007.
