# Implementation Plan

Vertical slices for the next major version. Each slice is end to end:
domain logic + tests, then UI, then docs. Slices are worked in order unless
the owner reorders them.

Status legend: `Backlog` · `Ready` · `In progress` · `Done` · `Blocked`

Last reviewed: 2026-11-14.

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

The `format` job is a **required** gate since B-3 landed (D-407, Q-004
resolved) — `prettier --check .` passes across all tracked files.

### A-2 · First signed release build

**Status: Done (2026-10-30)** — Q-002 resolved; signed release APKs ship.

Evidence:

- `assembleRelease` logs `versionName=3.1.1 versionCode=30101 signed=true`
  (CI run `40129841250`, `41258088806` native-INFER_BEGIN-fix build).
- `v3.1.1` released from tag `40960758092`: signed real + stub APKs +
  `APK-SHA256SUMS.txt`, both verified green on Linux/macOS/Windows.
- Release keystore generated and backed up outside the repo
  (`docs/RELEASE_KEYSTORE.md`); CI signing secrets configured (`BUILD_RELEASE.md`).

### A-3 · Update-in-place proof

**Status: Blocked** (depends on physical `arm64` device; owner action)

Acceptance criteria:

- Previous version installed on a physical `arm64` device.
- New APK installs over it with no error; no data loss.
- QC §5 checklist walked and recorded in `PROGRESS.md`.

Signed build is verified (`signed=true`); only on-device proof remains (A-3,
R-6.1), which cannot be done without a device.

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

**Status: Done (2026-10-21)** — Q-008 resolved.

Acceptance criteria:

- ✅ 19 permanent no-op stubs deleted.
- ✅ 4 auto-commit bots restricted to `workflow_dispatch`.
- ✅ No workflow holds `contents: write` on `push` (only `build-apk.yml`,
  `ci.yml`, `security-scan.yml` still fire on push).

### B-3 · Formatting baseline + enforced format gate

**Status: ✅ Done 2026-10-23 (D-407, Q-004 resolved).**

Acceptance criteria — all met:

- One dedicated mechanical `prettier --write .` pass, committed on its own
  (148 files).
- `npm run format:check` is now a **required** CI job (`format`), no longer
  `continue-on-error`.
- `android/app/src/main/assets/**` (the `cap sync` web bundle) added to
  `.prettierignore` so generated output is never reformatted.
- Documented in `DECISIONS.md` as D-407 (superseding the staged gate in D-303).
- Documented in `DECISIONS.md`.

### B-4 · Burn lint warnings to zero

**Status: Done (2026-10-23)** — Q-005 resolved; `--max-warnings=0` enforced
in `package.json`, CI lint passes on all three OS runners (656 → 0 via
slices B-4…B-7).

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

**Status: Done (2026-10-21)** — Q-006 deferred, Q-007 out of scope.

- Plugin marketplace → deferred to a later phase (owner: "plugin can wait
  until later in the project").
- Continuous cross-device sync → out of scope for this major version.

### D-2 · Settle Q-009 / Q-010

**Status: Needs owner decision**

`arm64`-only ABI (Q-009) and the ~30 MB bundled Whisper model in APK assets
(Q-010). Both affect install reach and APK size. Recorded in
`docs/assumptions-and-questions.md`; both still unanswered.

### D-3 · Guide Part II §26 open questions

**Status: Needs owner decision**

Recorded in `docs/assumptions-and-questions.md` ("Guide Part II §26 conflicts
— decisions requested"):

- Q-012 — Branch protection: require human review on top of agent merge?
- Q-013 — Local-test vs. no-heavy-work contributor wording?
- Q-014 — Keep repository public?
- Q-015 — Employer IP check (legal)?
- Q-019 — Formal trademark clearance (human/legal part)?
- Q-020 — Corrections to local `guide.md` (three stale statements)?

None block CI-gated work; all block launch readiness.

---

## Completed slices (this repository's recent history)

| Date       | Slice                                                     | Evidence                                                                                           |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-10-21 | Audio import & transcription bug fixes (4) + tests        | `AudioRecordingManager.test.ts`, `TranscriptionOrchestrator.test.ts`, `audioImportNotices.test.ts` |
| 2026-10-21 | Android signing, derived versioning, CI keystore handling | `android/app/build.gradle`, `.github/workflows/build-apk.yml`                                      |
| 2026-10-21 | Brand asset regeneration (26 PNGs / 11 XMLs)              | `scripts/generate-brand-assets.mjs`                                                                |
| 2026-10-21 | Lazy-import performance pass                              | `EventNotesList.tsx`, `AudioPlayerWidget.tsx`                                                      |
| 2026-10-21 | Dead service removal (`UniversalCaptureService`)          | `check:orphans` green                                                                              |
