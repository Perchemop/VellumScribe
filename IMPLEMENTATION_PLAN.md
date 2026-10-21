# Implementation Plan

Vertical slices for the next major version. Each slice is end to end:
domain logic + tests, then UI, then docs. Slices are worked in order unless
the owner reorders them.

Status legend: `Backlog` · `Ready` · `In progress` · `Done` · `Blocked`

Last reviewed: 2026-10-21.

---

## Track A — Ship a signed, updatable APK

### A-1 · Restore GitHub Actions
**Status: Done (2026-10-21)** — repository made public; runs execute normally.

Evidence:
- CI run `39566612176` — green on Linux, Windows and macOS
  (typecheck, lint, orphan check, tests, build).
- Security Scanning run `39566612217` — green.
- Android APK run `39566612127` — green, artifact
  `VellumScribe-Android-APKs-real`.
- Recorded as fact F-007 and as resolved question Q-001.

Note: the `format (staged, non-blocking)` job fails by design until slice B-3
lands (Q-004); it is `continue-on-error` so the workflow still concludes
success.

### A-2 · First signed release build
**Status: Ready — only Q-002 (keystore) blocks it.** The pipeline itself is
proven: CI already builds `assembleDebug` and `assembleRelease`, logging
`versionName=3.1.0 versionCode=30100 signed=false`.

Acceptance criteria:
- Release keystore generated and backed up outside the repo.
- Four signing secrets configured in CI (or `android/keystore.properties`
  locally).
- `assembleRelease` logs `VELLUM: assembleRelease -> versionName=3.1.0
  versionCode=30100 signed=true`.
- The release APK inside the artifact passes `apksigner verify --print-certs`
  and reports the expected certificate.

### A-3 · Update-in-place proof
**Status: Backlog** (depends on A-2)

Acceptance criteria:
- Previous version installed on a physical `arm64` device.
- New APK installs over it with no error; no data loss.
- QC §5 checklist walked and recorded in `PROGRESS.md`.

---

## Track B — Build hygiene

### B-1 · Adopt the guide's documentation set
**Status: Done (2026-10-21)** — this commit.

Acceptance criteria:
- Discovery docs exist: project brief, scope, inspiration, product name,
  assumptions & questions.
- Tracking docs exist: parity, implementation plan, requirements
  traceability, decisions, progress, attribution.
- `docs/development.md` and `docs/qc/manual-checklists.md` exist.
- Sub-agent definitions exist under `.opencode/agents/`.
- The guide file itself is never committed (guarded in `.gitignore`).

### B-2 · Remove legacy one-shot CI workflows
**Status: Backlog, awaiting owner approval (Q-008)**

Acceptance criteria:
- 15 permanent no-op stub workflows deleted.
- 4 auto-commit bots restricted to `workflow_dispatch`.
- No workflow holds `contents: write` on `push`.

### B-3 · Formatting baseline + enforced format gate
**Status: Backlog (Q-004)**

Acceptance criteria:
- One dedicated mechanical `prettier --write` pass committed on its own.
- `npm run format:check` added and required in CI.
- Documented in `DECISIONS.md`.

### B-4 · Burn lint warnings to zero
**Status: Backlog (Q-005)**

Acceptance criteria:
- Warning count reduced from 656 to 0 in slices of ≤50.
- `--max-warnings=0` set in `package.json`.

---

## Track C — Test coverage gaps

From `docs/parity.md` §Gaps. Each is its own slice.

### C-1 · Note lifecycle tests (archive / trash / restore)
**Status: Backlog**

Acceptance criteria: tests prove status transitions, that archived notes
leave the main list, trash purge is irreversible, and restore returns the
note to its original event.

### C-2 · Version history tests
**Status: Backlog**

Acceptance criteria: revision capture, diff/restore, and that restore does
not destroy the pre-restore state.

### C-3 · Reminder & geotag tests
**Status: Backlog**

Acceptance criteria: scheduling, firing and cancellation of reminders;
geotag persistence and clearing.

### C-4 · Backup restore tests
**Status: Backlog**

Acceptance criteria: encrypted archive round-trips; corrupted or truncated
archive is rejected with a clear message; wrong passphrase fails cleanly.

### C-5 · Native REAL inference on hardware
**Status: Blocked on A-2** — needs a signed APK and a physical `arm64` device.

Acceptance criteria: real speech transcribed on-device with the REAL engine
provenance badge, offline (airplane mode).

---

## Track D — Scope decisions

### D-1 · Settle Q-006 and Q-007
**Status: Needs owner decision**

Plugin marketplace and continuous cross-device sync are currently neither in
nor out of scope. Resolve in `docs/scope.md` + `DECISIONS.md` before any
architectural work that would be shaped by them.

### D-2 · Settle Q-009 / Q-010
**Status: Needs owner decision**

`arm64`-only ABI and the ~30 MB bundled Whisper model in APK assets. Both
affect install reach and APK size.

---

## Completed slices (this repository's recent history)

| Date | Slice | Evidence |
| --- | --- | --- |
| 2026-10-21 | Audio import & transcription bug fixes (4) + tests | `AudioRecordingManager.test.ts`, `TranscriptionOrchestrator.test.ts`, `audioImportNotices.test.ts` |
| 2026-10-21 | Android signing, derived versioning, CI keystore handling | `android/app/build.gradle`, `.github/workflows/build-apk.yml` |
| 2026-10-21 | Brand asset regeneration (26 PNGs / 11 XMLs) | `scripts/generate-brand-assets.mjs` |
| 2026-10-21 | Lazy-import performance pass | `EventNotesList.tsx`, `AudioPlayerWidget.tsx` |
| 2026-10-21 | Dead service removal (`UniversalCaptureService`) | `check:orphans` green |
