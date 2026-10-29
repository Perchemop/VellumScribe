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
8. **All decisions go to the owner via the question tool.** Every material
   choice — scope, governance, risk acceptance, open-question resolution — is
   put to the owner through the interactive question tool and answered
   explicitly before implementation. The owner's answer is the decision; it is
   then recorded in `DECISIONS.md` or `docs/assumptions-and-questions.md`. No
   decision is made silently by the agent (D-419).

---

## 2. Commands

Allowed locally (guide §4, tightened — no verification runs at all):

```bash
git status          # read-only
git diff            # read-only
git log             # read-only
gh ...              # PR / CI / repository administration (read + settings)
~/.config/opencode/scripts/ci.sh ...   # the only way to verify
npm run format      # Prettier --write: a *write*, not a check; allowed
```

`npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm run check:orphans`, `npm run test`, `npm run build`, `npm ci` and
`npx prettier --check` are **verification** and run only in GitHub Actions.

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

- **Do** run: editing files, reading files and CI logs, read-only git, `gh`,
  `npm run format` (write-only), and `ci.sh`.
- **Do not** run any verification locally: no `typecheck`, `lint`,
  `check:orphans`, `test`, `build`, `npm ci`, `vitest`, `npx tsc` — not even
  "just to be quick". Use `ci.sh` (guide §4, rule 6 in §1 above).
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

| Mode                    | Who                                    | Does                                                                                                            | Does not                      |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Chat (plan)**         | `orchestrator` (primary)               | clarifies, writes the Task brief (requirement IDs, files likely touched, acceptance criteria, DoD), delegates   | edit code, run builds         |
| **Task (execute)**      | `coder` (+ `explorer` for context)     | implements one bounded slice, writes tests, commits, pushes                                                     | run local builds/tests, merge |
| **Design (continuous)** | `designer`                             | reviews the rendered result of every user-visible slice; owns brand + `docs/design/**` + `assets/**`            | rewrite application logic     |
| **Verify**              | GitHub Actions via `ci-runner`         | format + lint + typecheck + orphans + tests on 3 OS runners; CodeQL, secret scan, licence scan, SBOM            | —                             |
| **Review**              | `reviewer` (read-only), then the human | reports issues, risks, missing tests; the human merges on the record of D-410                                   | fix, merge                    |
| **Local test**          | the human                              | runs/installs the CI artefact (APK/web) and confirms real behaviour on the primary OS                           | —                             |
| **Release**             | `coder` / `docs-writer`                | on a semver milestone: update `CHANGELOG.md` + `ROADMAP.md`, tag `v*.*.*`; CI publishes the Release + artefacts | skip a required gate          |

After merge, the loop continues: local test → semver release with honest notes
(guide §6.3) → update `ROADMAP.md` readiness from verified evidence only.

Supporting roles: `tester` (extend tests), `fixer` (repair a red CI gate),
`docs-writer` (tracking docs). None of them may run the toolchain locally
either — they hand off to `ci-runner`.

---

## 6. Sub-agent conventions

Agent definitions live in `.opencode/agents/`. Roles are wired to the
provider that is actually connected (currently OpenCode free / Big Pickle):

| Role                  | Agent file                         | Use for                                                     |
| --------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Lead / Architect      | `.opencode/agents/orchestrator.md` | Discovery, scope, decisions, slice planning                 |
| Coder                 | `.opencode/agents/coder.md`        | Implementing a slice                                        |
| Designer (UI/UX)      | `.opencode/agents/designer.md`     | Visual identity + continuous design/performance review      |
| Explorer / Researcher | `.opencode/agents/explorer.md`     | Codebase search, mapping, audits, **public** research notes |
| Reviewer              | `.opencode/agents/reviewer.md`     | Post-slice review, gate verification                        |
| Tester                | `.opencode/agents/tester.md`       | Writing and extending tests                                 |
| Fixer                 | `.opencode/agents/fixer.md`        | Repairing a red CI gate                                     |
| Docs writer           | `.opencode/agents/docs-writer.md`  | Tracking docs (`PROGRESS`, traceability, `CHANGELOG`)       |
| CI runner             | `.opencode/agents/ci-runner.md`    | Triggering and reporting GitHub Actions verification        |

The **designer** is a standing, mandatory role (guide §27): it reviews the
_rendered_ result of every user-visible slice, not just the diff, and owns all
visual/graphic work. A user-visible slice is not Done until its design review
has passed.

When a stronger free provider (Gemini, Groq) is connected, only the `model:`
field in those files changes — role structure stays.

**Prompting rule:** always attach the repo's current state to a sub-agent
prompt (`PROGRESS.md`, the slice in `IMPLEMENTATION_PLAN.md`, the relevant
`docs/parity.md` rows). Sub-agents start with fresh context and must not be
left to guess requirements.

---

## 7. Continuous integration

The required verification signal is `.github/workflows/ci.yml`, which runs on
Linux, Windows and macOS (all shell steps declare `shell: bash`):

1. Format check — **enforced** (`prettier --check .`), baseline established in
   slice B-3 (D-407; Q-004 resolved).
2. Lint — **enforced with warnings denied** (`--max-warnings=0`, guide §4);
   burned down from 656 to **0** in slice B-7 (Q-005 resolved).
3. Orphan check — enforced, fails on dead code.
4. Typecheck — enforced.
5. Full test suite — enforced.
6. Production build — enforced.

Security and supply-chain gates in `.github/workflows/security-scan.yml`:

7. **CodeQL** SAST (`javascript-typescript`).
8. **Dependency Audit** (`npm audit --audit-level=high`).
9. **secret scan** — `gitleaks` over the full history (guide §20.1).
10. **licence scan** — `node scripts/check-licenses.mjs`, fails on
    strong-copyleft / source-available / non-commercial / unlicensed
    dependencies (guide §19.2, §19.4).
11. **sbom** — a CycloneDX SBOM uploaded as an artefact (guide §19.4).

**Authoritative checks** are declared in `.ci-required.txt` (one check name per
line, exactly as GitHub reports it): `format`, `verify (ubuntu-latest)`,
`verify (windows-latest)`, `verify (macos-latest)`, `secret scan`,
`licence scan`, `sbom`. Branch protection on `main` requires these to pass
(guide §20.2); direct pushes and force-pushes are disallowed. Checks not listed
— including `CodeQL` — are reported but do not decide the verdict, and a red
non-required check is **never** silently dropped (D-410).

Android tags: pushing a `v*.*.*` tag triggers
`.github/workflows/build-apk.yml` (signed release APKs + `APK-SHA256SUMS.txt`)
and `.github/workflows/release.yml` (Release body from the matching
`CHANGELOG.md` section); whichever finishes first creates the Release and the
other updates it.

**Verified history:** CI run `39566612176` passed on all three OS runners;
Security Scanning `39566612217` passed; the Android APK workflow
`39566612127` produced `VellumScribe-Android-APKs-real` with
`versionName=3.1.0 versionCode=30100` — **unsigned**, because no keystore
exists yet (Q-002). C-2 hardening (rate limits, path containment, argv
subprocesses, credential CORS allow-list, memory-only backup passphrase)
landed on `main` at `1621420`.

**Verification protocol (CI-first, guide §4):** no `npm test`, `npm run build`,
`npm run lint`, `npm run format:check`, `npx tsc`, `vitest`, or `npm ci` runs
on this machine — the host is memory-constrained and restarts under load.
Verify changes with `~/.config/opencode/scripts/ci.sh run "<description>"`,
which commits the working tree to the `opencode/ci` branch, pushes it, opens a
PR to `main`, and runs the repository's CI. Always cite a run ID you actually
inspected. `ci.sh run` checks out `opencode/ci` _before_ committing, so never
commit on another branch and expect it to travel — commit on `opencode/ci`.

---

## 8. Documentation set

| File                                | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `docs/project-brief.md`             | Why the app exists                                               |
| `docs/scope.md`                     | What is in and out of scope                                      |
| `docs/inspiration.md`               | Clean-room inspiration statement                                 |
| `docs/product-name.md`              | Locked name and usage rules                                      |
| `docs/assumptions-and-questions.md` | Facts vs assumptions vs open questions                           |
| `docs/architecture.md`              | _(this repo uses `docs/ARCHITECTURE.md`)_                        |
| `docs/parity.md`                    | Capability tracker                                               |
| `docs/qc/manual-checklists.md`      | Manual QC                                                        |
| `IMPLEMENTATION_PLAN.md`            | Vertical slices                                                  |
| `REQUIREMENTS_TRACEABILITY.md`      | Requirement → file → test                                        |
| `DECISIONS.md`                      | Decision log                                                     |
| `PROGRESS.md`                       | Running status                                                   |
| `ATTRIBUTION.md`                    | Third-party licences (code **and** non-code assets, model terms) |
| `CHANGELOG.md`                      | User-visible history                                             |
| `ROADMAP.md`                        | Milestones + evidence-based readiness                            |
| `VISION.md`                         | Goals; the scope constitution                                    |
| `GOVERNANCE.md`                     | Who decides what; roles; disputes                                |
| `CONTRIBUTORS.md`                   | Recognition for every contributor                                |
| `CODE_OF_CONDUCT.md`                | Behaviour, scope, enforcement, reporting                         |
| `ACCESSIBILITY.md`                  | WCAG 2.2 AA target, limits, report path                          |
| `docs/design/brand.md`              | Visual identity (owned by `designer`)                            |
| `docs/research/`                    | Human-gated public research notes                                |
| `docs/repo-radar.md`                | Build-vs-adopt radar passes (guide §4A)                          |
| `docs/process-feedback.md`          | Agent-reported process friction (addendum §N, append-only)       |

---

## 9. Addendum adoption (client mode, MCP, QA policy)

The local addendum extends the guide with a **client-mode operating model**. The
human is a **client, not a developer**: they state goals and priorities, approve
or reject, and try builds. They never write or debug application code. Agents
act as tech lead + designer + implementers and translate client language into
Tasks, PRs, and releases.

### 9.1 How agents talk to the client

- Prefer concrete, numbered **try-steps**: "Download `VellumScribe-Android-APKs-real`
  from the Actions run page, install it, then open the app and create a note."
- Never ask the client to run a build command, read a stack trace, or edit source.
- When blocked, explain the blocker in one line of plain language and offer 1–3
  choices (simplify and ship / park and do the next item / client tries the build).
- A `BROKEN` report from the client ("what I did / expected / happened") becomes
  a regression test first, then a fix.

### 9.2 Process phases (where this repo is)

| Addendum phase                                  | Status here                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| 0 Bootstrap / 1 Discovery / 2 Foundation        | Done (docs + CI + app all exist)                           |
| 3 v0.1.0 hard gate                              | Passed (first functional build + releases shipped)         |
| 4 Roadmap + research                            | Done (`ROADMAP.md`, `docs/research/` human-gated)          |
| 5 Shared crash-report / update-check capability | Done as app features (`CrashReporter`, `appUpdateManager`) |
| 6 Feature loop                                  | Current                                                    |
| 7 Polish & multi-platform                       | In progress (a11y, visual evidence, empty states)          |
| 8 Finished product                              | Awaits client sign-off of the v1 scope                     |

The addendum's **Rust** sections (§K, §M.2) apply to Cargo workspaces and do not
bind this TypeScript/React repo. Their _intent_ is already satisfied and is the
binding equivalent here:

| Rust gate (addendum §K/§M)       | VellumScribe equivalent                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Logic in `crates/*-core`, not UI | Logic in `src/lib`, `src/repositories`, `src/services` — no component imports |
| Headless `cargo test`            | Vitest in CI on 3 OS runners, no display, no real network                     |
| `rust-toolchain.toml` pin        | `package.json` `engines` (Node ≥ 20, npm ≥ 10) + CI `node-version: 22`        |
| `clippy -D warnings`             | `eslint --max-warnings=0`                                                     |
| README "try without toolchain"   | Download the signed APK / release artefact; no Node or Android SDK needed     |
| `cargo tree` licence audit       | `licence scan` + CycloneDX SBOM (both required CI checks)                     |

### 9.3 MCP setup (addendum §D)

- **Context7** — configured and connected (`~/.config/opencode/opencode.json`).
- **GitHub MCP** — **disabled by owner decision (2026-10-29): the repository
  operates gh-only.** All GitHub operations (PRs, issues, Actions, Releases,
  secrets) work through the authenticated `gh` CLI, so nothing is blocked and
  no PAT is wanted for now. Should that change, the client creates a PAT (repo
  - workflow scope) and replaces `REPLACE_WITH_FINE_SCOPED_GITHUB_PAT` in the
    config, then sets `"enabled": true`.
- Smallest-set rule (§J.6): no further MCP servers are enabled — tool sprawl
  hurts free models.

### 9.4 Deterministic-test policy (addendum §M.5)

CI tests must be deterministic: **no real network**, no wall-clock sleeps used
as synchronisation, no dependence on machine-specific paths.

- HTTP is always mocked (`vi.stubGlobal('fetch', …)`).
- Time-based logic uses `vi.useFakeTimers()` / `vi.setSystemTime()`
  (see `UnlockSessionManager.test.ts`).
- Persistence tests use the in-memory SQLite engine (`SqliteEngine.resetForTesting()`).
- If a test is flaky twice, quarantine it with an issue link — never leave red
  or flaky `main`.

### 9.5 Task brief and release notes

Before coding a slice, write the addendum §E task brief (goal in client
language, acceptance criteria, out of scope, primary-OS try-steps, risks,
ROADMAP link). Release notes follow §F: Summary, Added, Changed, Fixed, **Known
limitations**, and a "Try it" pointer to the artefact — `CHANGELOG.md` sections
feed the GitHub Release body via `release.yml`.
