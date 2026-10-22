# Decision Log

Format: **D-nnn · date · title** — context, decision, alternatives rejected,
consequences. Once made, a decision is not revisited without a new entry.

---

## Process

### D-001 · 2026-10-21 · Adopt the local build guide as the operating process
**Context.** The owner keeps a project-agnostic build guide on this machine
and asked that it govern development of this app.
**Decision.** Adopt it. Its discovery docs, tracking files, sub-agent roles,
CI gates and Definition of Done become binding for this repository.
**Rejected.** Treating it as advisory — that would make the docs decorative.
**Consequences.** The documentation set in `docs/development.md` §8 now exists
and must be kept current; slices replace ad-hoc commits.

### D-002 · 2026-10-21 · Narrow platforms to Android + Web only
**Context.** The guide defaults to "all practical platforms".
**Decision.** The owner explicitly narrowed the target: Android (Capacitor
APK) and web only for the next major version. No Windows/macOS/Linux port,
no iOS, no WASM engine.
**Rejected.** Following the guide's default — an explicit human narrowing
during discovery takes precedence over the guide's default.
**Consequences.** Recorded in `docs/scope.md`; desktop/iOS work is now
out of scope by decision rather than by neglect.

### D-003 · 2026-10-21 · Name the inspiration sources and keep the clean room
**Context.** The guide requires an inspiration list before implementation.
**Decision.** Inspiration: **whisper.cpp / Whisper** (MIT, also a licensed
dependency) and **Obsidian** (proprietary — black-box behavioural
inspiration only).
**Rejected.** Leaving the list vague — that is how clean-room projects drift
into copying.
**Consequences.** `docs/inspiration.md` states what may and may not be taken
from each.

### D-004 · 2026-10-21 · Record out-of-scope capabilities explicitly
**Decision.** Real-time collaboration, multi-user/teams and open-ended AI
chat are out of scope for the next major version.
**Rejected.** Leaving them implicit — implicit scope always expands.
**Consequences.** `docs/scope.md`. Continuous sync is now explicitly out of
scope; the plugin marketplace is deferred to a later phase (Q-006).

### D-005 · 2026-10-21 · Make the repository public
**Context.** Local machine cannot build the APK; every Actions run fails; the
guide requires a public repo + Actions when local resources are constrained.
**Decision.** The owner chose to make the repo public.
**Rejected.** Staying private (loses free Actions minutes) and building only
locally (impossible without JDK/SDK and 4–6 GiB RAM).
**Consequences.** Code and history become publicly visible — a secret scan
(clean) was run first. **Verified:** after the change, Actions runs execute
normally (Q-001 resolved; CI, Security Scanning and the APK build all green).

### D-006 · 2026-10-21 · Use `docs/ARCHITECTURE.md`, do not create `docs/architecture.md`
**Context.** The guide asks for `docs/architecture.md`. This repo already has
`docs/ARCHITECTURE.md`.
**Decision.** Keep the existing file as the architecture document.
**Rejected.** Creating `docs/architecture.md` alongside it — the two names
collide on case-insensitive filesystems (macOS/Windows), and CI now runs on
Windows and macOS.
**Consequences.** `docs/development.md` §8 notes the substitution.

---

## Audio & transcription

### D-101 · 2026-10-21 · `local_first` requires both network permission and cloud consent
**Context.** Transcription policy previously could send audio when network
was allowed but the user had not granted cloud consent.
**Decision.** `local_first` only when network is allowed **and** cloud
consent is granted; otherwise `offline_only`.
**Rejected.** Treating "network allowed" as sufficient — consent is a
separate, explicit signal.
**Consequences.** `TranscriptionOrchestrator.resolveTranscriptionPolicy` +
tests.

### D-102 · 2026-10-21 · Keep the 30-minute cap, but never silently
**Context.** Long recordings were truncated with no indication.
**Decision.** Keep the cap; report it through a callback, a log line and a
`wasTruncated` flag surfaced in the editor banner and modal.
**Rejected.** Removing the cap (unbounded memory/conversion cost) and
truncating silently (the original bug).
**Consequences.** UI banner + modal now carry `wasTruncated` /
`wasConversionSkipped`.

### D-103 · 2026-10-21 · Hard import byte limits
**Decision.** `MAX_IMPORT_BYTES` / `MAX_CONVERSION_BYTES` guard the import
pipeline, with notice copy in `src/lib/audioImportNotices.ts`.
**Consequences.** Documented in `docs/KNOWN_LIMITATIONS.md` §7.

---

## Android & release

### D-201 · 2026-10-21 · `versionCode` derived from `package.json`
**Formula.** `major*10000 + minor*100 + patch` → `3.1.0` = `30100`, strictly
greater than the previous hard-coded `31`.
**Rejected.** Hand-maintaining an integer (drift) and a plain `major*1000+…`
map (would let `3.10.0` collide with a future `4.0.0`-era value less
cleanly).
**Consequences.** Bumping `package.json` is now the release action.

### D-202 · 2026-10-21 · Debug and release share one signing key
**Decision.** Both `signingConfigs` read the same key so a sideloaded debug
build remains upgradable by a release build.
**Rejected.** Separate debug/release keys — would break update-in-place for
anyone who tested with a debug build.
**Consequences.** `INSTALL_FAILED_UPDATE_INCOMPATIBLE` avoided; the keystore
must never be lost.

### D-203 · 2026-10-21 · `arm64-v8a` only
**Status.** Kept as-is, documented in `docs/KNOWN_LIMITATIONS.md` §8.
**Open.** Owner has not confirmed reach vs size trade-off (Q-009).

### D-204 · 2026-10-21 · Brand assets are generated, never hand-edited
**Decision.** `scripts/generate-brand-assets.mjs` rasterises the favicon "V"
mark into all 26 launcher/round/foreground/splash PNGs; `npm run assets:brand`
regenerates them. Checked-in binaries are never edited directly.
**Rejected.** Editing PNGs by hand (guarantees web/Android drift).
**Consequences.** Adaptive background unified to `#09090B`; `<monochrome>`
added; unused template vectors deleted.

---

## Performance & cleanup

### D-301 · 2026-10-21 · Fix bundle bloat by making imports lazy, not by removing them
**Context.** Eager JS in the entry graph was 893.12 kB.
**Decision.** Keep the features, lazy-load `NoteShareModal` and
`TranscriptionRecoverySheet` at their use sites.
**Rejected.** Deleting features to shrink the bundle.
**Consequences.** 893.12 kB → 867.76 kB.

### D-302 · 2026-10-21 · Delete dead code rather than park it
**Decision.** Removed `AudioRecordingManager.blobToBase64` (unused) and
`src/services/UniversalCaptureService.ts` (unreferenced).
**Why it matters.** `check:orphans` is a CI step — unreferenced files fail
the build regardless of whether they compile.

### D-303 · 2026-10-21 · Stage, do not force, the format gate
**Context.** `npm run format:check` reports 194 files needing reformatting
(measured 2026-10-21, full project scope).
**Decision.** Do not enable a failing gate. Record it as Q-004 with a
dedicated formatting slice (B-3) before enforcement.
**Rejected.** Enabling it now (CI red) and silently skipping it (hides debt).
**Consequences.** The gate is listed in CI as staged until B-3 lands.

### D-304 · 2026-10-21 · Clean up the legacy CI workflows
**Context.** 19 permanent no-op stubs (`if: false`) and 4 push-triggered
auto-commit bots holding `contents: write` were left in
`.github/workflows/`.
**Decision.** Owner approved removal/restriction (Q-008 resolved): delete all
19 stubs; convert the 4 bots to `workflow_dispatch` only. `vendor-whisper.yml`
is untouched (dispatch-only, legitimate vendor-fetch tool).
**Rejected.** Leaving them (dead write path to `main`, noise in the Actions UI)
and deleting the bots entirely (they remain useful for manual one-off runs).
**Consequences.** `.github/workflows/` is now 8 files. No workflow fires on
`push` except `build-apk.yml`, `ci.yml` and `security-scan.yml`.

---

## Sub-agents

### D-401 · 2026-10-21 · Wire all roles to the provider actually connected
**Decision.** `.opencode/agents/` assigns **OpenCode free (Big Pickle)** to
every role for now, because it is the only connected provider. The role
structure (orchestrator/coder/explorer/reviewer) is built so that swapping in
Gemini or Groq later is a one-line `model:` change per file.
**Rejected.** Writing `model: gemini/...` references for providers with no
key configured — those agents would simply fail to run.

---

### D-402 · 2026-10-22 · CI-first: no heavy toolchain runs on this machine (guide §4)
**Decision.** All heavy/RAM-intensive work (`npm ci`, `npm install`, `npm test`,
`npm run build`, `npm run lint`, `npx tsc`, `vitest`, `vite build`, and the
full `npm run verify`) runs exclusively on GitHub Actions via
`~/.config/opencode/scripts/ci.sh`, never locally. Local work is limited to
editing, read-only checks, git operations, and reviewing CI results. After
every meaningful change the agent commits and pushes and treats the GitHub
Actions result as the source of truth.
**Rejected.** Running "just this once" a local build/test to save a CI cycle
— the guide §4 is NON-NEGOTIABLE and overrides every other instruction.
**Consequences.** `npm run verify` is no longer executed locally. Verification
is requested through `ci.sh run "<description>"`, which pushes to the
`opencode/ci` branch, opens a PR to `main`, and runs the repository's CI.

### D-403 · 2026-10-22 · Lint denies warnings (`--max-warnings=0`) (guide §4 Required CI)
**Decision.** `eslint src --max-warnings=0` — any lint warning fails CI.
**Rejected.** The previous transitional ceiling `--max-warnings=700` with 656
warnings — the guide requires warnings denied.
**Consequences.** CI lint is **currently FAILING** on 656 pre-existing warnings
until they are burned down (Q-005, active blocker #1). Burn-down happens in
slices of ≤50 via `ci.sh` iterations: edit locally, verify on CI. Until
resolved, CI lint is red and per guide §4 this is the first task to fix.

### D-404 · 2026-10-22 · Free-model policy + dynamic model selection (guide §5)
**Decision.** Provider order: OpenCode free first → NVIDIA free second. The
orchestrator discovers available free models at session start and assigns the
best one per role; exact model IDs are not hard-coded as permanent pins.
The mapping is recorded in `docs/current-model-map.md` and re-validated each
session (§5.2/§5.6). Agent definitions live in `.opencode/agents/` with V2
permissions; orchestrator is edit:deny/bash:deny (plans and delegates only).
**Rejected.** Hard-coding a single model ID (it will go stale), using Ollama or
any local model hosting (§5.1.4).
