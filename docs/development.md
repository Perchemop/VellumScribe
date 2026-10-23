# Development Guide

How to work on VellumScribe. This repo follows the owner's local build guide
(`~/guide.md`, never committed). This file translates that guide into the
concrete commands, files and rules that apply here.

---

## 1. Hard rules

1. **Never write code without a slice.** Work is organised as vertical slices:
   one capability, end to end, including its tests. Track every slice in
   `IMPLEMENTATION_PLAN.md` and every requirement in
   `REQUIREMENTS_TRACEABILITY.md`.
2. **Never claim unverified work is complete.** A slice is Done only when
   CI is green via `ci.sh` _and_ the QC checklist for it has been walked.
   If CI is down or a gate is failing, say so explicitly rather than implying
   CI passed.
3. **Never invent requirements.** Open questions live in
   `docs/assumptions-and-questions.md`; unresolved ones are not silently
   decided by an agent.
4. **Never break update-in-place.** Application ID, package name, signing key
   and version monotonicity must not regress (see §4).
5. **Clean-room.** `docs/inspiration.md` rules are non-negotiable.
6. **CI-first: nothing verifies locally.** Every gate — `npm ci`,
   `npm install`, `npm test`, `npm run build`, `npm run lint`,
   `npm run format:check`, `npx tsc`, `vitest`, and the full `npm run verify` —
   runs exclusively on GitHub Actions via
   `~/.config/opencode/scripts/ci.sh` (guide §4). The host is memory-constrained
   and restarts under load. Per guide §4.2 local work is limited to: editing
   source files, reading files and CI logs, lightweight git operations, and
   reviewing Pull Requests and CI results. There is no local-check allowance —
   not even a "quick" `eslint`/`prettier`/`tsc` run.
7. **Chat -> Task -> PR -> merge.** Plan in Chat mode (orchestrator, §5.1
   below), execute one bounded Task (coder), let GitHub Actions verify, open or
   update a Pull Request, and let the human review and merge (guide §5.2/§9).

---

## 2. Commands

Light / read-only (safe on this machine):

```bash
git status          # read-only
git diff            # read-only
git log             # read-only
npm run format      # light formatting script (coder/fixer/tester may run)
npm run format:check
```

Heavy / CI-only (never run on this machine — guide §4):

```bash
npm install --legacy-peer-deps   # heavy; blocked locally
npm ci                           # heavy; blocked locally
npm run verify                   # typecheck + lint + orphan check + tests
npm test                         # vitest
npm run typecheck                # tsc
npm run lint                     # eslint --max-warnings=0
npm run check:orphans
npm run build                    # vite build + esbuild
./gradlew assembleDebug assembleRelease   # Android; CI only
```

Verify a change with CI:

```bash
~/.config/opencode/scripts/ci.sh run "<short description>"
# commits the working tree to opencode/ci, opens a PR to main,
# runs the repository's CI, waits, and prints the result.
```

Android (CI only — see §3):

```bash
npx cap sync android
./gradlew assembleDebug assembleRelease
```

`npm run verify` via CI is the Definition of Done gate. Confirm CI is green
before every commit; never run it locally.

> `check:orphans` exits 1 on **any** unreferenced file, and it is a CI step —
> dead code breaks the build even if it compiles.

---

## 3. Local machine constraints

The local machine has ~2.7 GiB RAM, no JDK, no Android SDK/NDK/CMake.

- **Do** run: editing, typecheck, lint, orphan check, unit tests, Vite build.
- **Do not** run Gradle or CMake locally — it will OOM or simply not find the
  toolchain. Heavy builds run in GitHub Actions.
- Reinstalling the full Android toolchain locally needs roughly 10–12 GiB of
  disk and 4–6 GiB RAM to build. Not available here.

---

## 4. Release & update-in-place invariants

These must never regress:

| Invariant                                    | Where it lives                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Application ID stays `com.vellumscribe.app`  | `android/app/build.gradle`                                               |
| `versionCode` strictly increases per release | derived from `package.json` (`major*10000 + minor*100 + patch`)          |
| Same signing key across debug and release    | `signingConfigs` in `android/app/build.gradle`                           |
| Keystore never committed                     | `.gitignore` covers `*.jks`, `*.keystore`, `android/keystore.properties` |

A new APK only updates an installed copy if the **application ID and the
signing key both match**. Verify per `docs/BUILD_RELEASE.md` §5 before any
release. See `docs/KNOWN_LIMITATIONS.md` §8 for ABI limits.

---

## 5. Working agreement per slice

1. Record the slice and its acceptance criteria in `IMPLEMENTATION_PLAN.md`.
2. Implement domain logic + tests first, then UI on top (the guide's
   domain → integration → UI order).
3. Update `REQUIREMENTS_TRACEABILITY.md` with requirement → file → test.
4. Append the outcome to `PROGRESS.md`; log any non-obvious choice in
   `DECISIONS.md`.
5. Walk the matching checklist in `docs/qc/manual-checklists.md`.
6. Verify via `~/.config/opencode/scripts/ci.sh run "<description>"`
   (CI-first, guide §4), which commits, pushes, and opens/updates the PR. Check
   the resulting PR checks — never run `npm run verify` (or any part of it)
   locally.
7. Update `PROGRESS.md` **and** `REQUIREMENTS_TRACEABILITY.md` (guide §5.2/§6),
   and `CHANGELOG.md` for user-visible change.

---

## 5b. Operating model: Chat -> Task -> Pull Request (guide §5)

We emulate cto.new's paid workflow using free models and GitHub Actions.

| Mode | Who | Does | Does not |
| --- | --- | --- | --- |
| **Chat (plan)** | `orchestrator` (primary) | clarifies, writes the Task brief (requirement IDs, files likely touched, acceptance criteria, DoD), delegates | edit code, run builds |
| **Task (execute)** | `coder` (+ `explorer` for context) | implements one bounded slice, writes tests, commits, pushes | run local builds/tests, merge |
| **Verify** | GitHub Actions via `ci-runner` | format + lint + typecheck + orphans + tests on 3 OS runners | — |
| **Review** | `reviewer` (read-only), then the human | reports issues, risks, missing tests; human merges | fix, merge |

Supporting roles: `tester` (extend tests), `fixer` (repair a red CI gate),
`docs-writer` (tracking docs). None of them may run the toolchain locally
either — they hand off to `ci-runner`.

---

## 6. Sub-agent conventions

Agent definitions live in `.opencode/agents/`. Roles are wired to the
provider that is actually connected (currently OpenCode free / Big Pickle):

| Role             | Agent file                         | Use for                                     |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| Lead / Architect | `.opencode/agents/orchestrator.md` | Discovery, scope, decisions, slice planning |
| Coder            | `.opencode/agents/coder.md`        | Implementing a slice                        |
| Explorer         | `.opencode/agents/explorer.md`     | Codebase search, mapping, audits            |
| Reviewer         | `.opencode/agents/reviewer.md`     | Post-slice review, gate verification        |

When a stronger free provider (Gemini, Groq) is connected, only the `model:`
field in those files changes — role structure stays.

**Prompting rule:** always attach the repo's current state to a sub-agent
prompt (`PROGRESS.md`, the slice in `IMPLEMENTATION_PLAN.md`, the relevant
`docs/parity.md` rows). Sub-agents start with fresh context and must not be
left to guess requirements.

---

## 7. Continuous integration

`.github/workflows/ci.yml` is the required verification signal and runs on
Linux, Windows and macOS (all shell steps declare `shell: bash`):

1. Format check — **staged, not yet enforced** (Q-004; 194 unformatted files).
   `continue-on-error` until slice B-3 establishes the baseline.
2. Lint — **enforced with warnings denied** (`--max-warnings=0`, guide §4).
   **Currently FAILING** on 656 pre-existing warnings — active blocker Q-005.
   Burn down in slices of ≤50 via `ci.sh` iterations.
3. Orphan check — enforced, fails on dead code.
4. Typecheck — enforced.
5. Full test suite — enforced.
6. Production build — enforced.

**Verified 2026-10-21 (before the lint-denied flip):** CI run `39566612176`
passed on all three OS runners, Security Scanning (`39566612217`) passed, and
the Android APK workflow (`39566612127`) produced `VellumScribe-Android-APKs-real`
with `versionName=3.1.0 versionCode=30100` — **unsigned**, because no keystore
exists yet (Q-002).

**Verification protocol (CI-first, guide §4):** no `npm test`, `npm run build`,
`npm run lint`, `npx tsc`, `vitest`, or `npm ci` runs on this machine — the
host is memory-constrained and restarts under load. Verify changes with
`~/.config/opencode/scripts/ci.sh run "<description>"`, which commits the
working tree to the `opencode/ci` branch, pushes it, opens a PR to `main`, and
runs the repository's CI. Always cite a run ID you actually inspected.

---

## 8. Documentation set

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `docs/project-brief.md`             | Why the app exists                        |
| `docs/scope.md`                     | What is in and out of scope               |
| `docs/inspiration.md`               | Clean-room inspiration statement          |
| `docs/product-name.md`              | Locked name and usage rules               |
| `docs/assumptions-and-questions.md` | Facts vs assumptions vs open questions    |
| `docs/architecture.md`              | _(this repo uses `docs/ARCHITECTURE.md`)_ |
| `docs/parity.md`                    | Capability tracker                        |
| `docs/qc/manual-checklists.md`      | Manual QC                                 |
| `IMPLEMENTATION_PLAN.md`            | Vertical slices                           |
| `REQUIREMENTS_TRACEABILITY.md`      | Requirement → file → test                 |
| `DECISIONS.md`                      | Decision log                              |
| `PROGRESS.md`                       | Running status                            |
| `ATTRIBUTION.md`                    | Third-party licences                      |
| `CHANGELOG.md`                      | User-visible history                      |
