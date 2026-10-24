# Contributing to VellumScribe

Thanks for considering a contribution. This is a small project, so the process
is lightweight — but a few conventions matter for keeping the codebase
trustworthy. This document covers what to expect and what is expected of you,
and it links the rest: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md),
[`GOVERNANCE.md`](GOVERNANCE.md), and [`SECURITY.md`](SECURITY.md).

## The one rule that matters most

**Never make a feature look like it works when it doesn't.** This codebase
previously had a systemic problem with exactly that: simulated network calls
that reported fake success, a hardcoded placeholder identity used as a default,
UI copy claiming hardware-backed security that didn't exist, and AI fallbacks
that fabricated plausible-looking content instead of saying "unavailable." See
[`AUDIT.md`](./AUDIT.md) for the full history and
[`CHANGELOG.md`](./CHANGELOG.md) for how it was fixed. Please don't reintroduce
this pattern:

- If a feature isn't implemented yet, say so in the UI and/or throw a clear
  error — don't return a plausible-looking fake result.
- If an operation didn't actually happen (a network call failed, wasn't
  attempted, or isn't supported), the return value should say
  `success: false` with a real reason, not `true` with fabricated details.
- Don't invent placeholder user data (emails, names, tokens) as a "default" —
  leave the field empty and let the UI ask for it.
- If you're not sure whether a code path can be exercised in production, search
  for its callers before assuming it's fine to leave stubbed. A few of the
  issues in `AUDIT.md` were "fixed" in a file that turned out to be dead code
  never imported by the actual build — grep for the export before trusting your
  fix is live.

## Ways to contribute

You do not have to write code to help. In rough order of how easy it is to
start:

- **Documentation** — fix a confusing instruction, add a missing screenshot,
  improve the accessibility of a doc (headings, alt text, descriptive links).
- **Tests** — coverage is thin; tests for `src/lib/cryptoUtils.ts` and
  `src/lib/storage.ts` are a good starting point.
- **Bug reports** — a precise reproduction is a real contribution.
- **Translations and copy** — clearer wording for errors and UI labels.
- **Code** — see the good-first issues labelled [`good first issue`](https://github.com/Perchemop/VellumScribe/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/Perchemop/VellumScribe/labels/help%20wanted).

## Reporting a bug

Open an issue and choose the **Bug report** template. It asks for the version,
what you did, what you expected, and what happened. The most useful reports
include exact error text or the in-app diagnostics (Settings → Diagnostics —
they exclude secrets by design).

Before filing, search the existing issues for a duplicate.

## Proposing a feature

Open an issue and choose the **Feature request** template. Describe **the
problem first and the solution second** — VellumScribe holds a narrow scope on
purpose (see [`VISION.md`](VISION.md) and [`docs/scope.md`](docs/scope.md)).
For a larger feature, expect a discussion on the issue before any code is
written; that is cheaper for everyone than a surprise PR that doesn't fit.

## Reporting a security or accessibility problem

- **Security:** do **not** open a public issue. Follow
  [`SECURITY.md`](SECURITY.md) — the repository's private vulnerability
  reporting is the preferred path.
- **Accessibility:** use the **Accessibility issue** template. These are
  treated as time-sensitive, because an accessibility problem can block the
  whole app for someone.

## Setting up the environment

Requires **Node.js 22+**.

```bash
git clone https://github.com/Perchemop/VellumScribe.git
cd VellumScribe
npm install --legacy-peer-deps
cp .env.example .env      # optional; only needed for cloud/AI features
npm run dev
```

The Android build additionally needs the Android SDK, NDK and CMake, and is not
required for web or library work.

## Running the checks locally

> **Contributors: run these locally.** They are the same gates CI runs. (The
> maintainer of _this_ repository runs them only in GitHub Actions because
> their own machine is memory-constrained — that is a `guide.md` operating rule
> for this build, not a rule for everyone. Your machine should run them.)

```bash
npm run format        # write Prettier formatting
npm run format:check  # verify formatting (CI gate)
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src --max-warnings=0  (warnings fail)
npm run check:orphans # fails on any unreferenced file
npm run test          # vitest
npm run build         # vite build + server bundle
```

`npm run verify` chains typecheck + lint + orphan check + tests. Run it (or the
individual gates) before opening a PR. Formatting must be clean; lint warnings
are **errors** here.

`check:orphans` exits 1 on **any** unreferenced file, so dead code breaks the
build even when it compiles.

## Code style and layout

- TypeScript, strict-leaning. Don't introduce new type errors.
- `npm run format` (Prettier) before committing — the CI format gate is
  enforced.
- Components live in `src/components/`, one file per modal/view. Core logic
  (storage, crypto, cloud sync, AI service) lives in `src/lib/` and should stay
  UI-framework-agnostic where practical.
- Before adding a new file, check whether something with a similar name already
  exists elsewhere in the tree (see the dead-file problem above).
  `grep -rl ComponentName src/` before assuming a component isn't rendered
  anywhere.
- User-visible changes should be accessible: see the accessibility checklist in
  the pull request template and [`ACCESSIBILITY.md`](ACCESSIBILITY.md).

## What a contribution is reviewed against

Every PR is reviewed against its stated acceptance criteria, correctness, test
coverage, security, and — for anything a user can see — the accessibility and
design checklists. A PR is **not** accepted until CI is green; the required
gates are format, typecheck, lint (warnings denied), orphan check and tests on
Linux, Windows and macOS, plus secret scan, licence scan and CodeQL.

Please keep PRs focused: an unrelated refactor mixed with a bug fix is harder
to review and to revert.

## Licence of your contribution (inbound = outbound)

VellumScribe is MIT-licensed. By opening a pull request you agree that your
contribution is licensed under the same MIT terms (the repository's
[`LICENSE`](LICENSE)). No CLA is required — like most GitHub projects, we rely
on the "inbound = outbound" default in GitHub's Terms of Service.

We also ask that you **sign off** your commits to certify you have the right to
submit the work (the [Developer Certificate of Origin](https://developercertificate.org/)):

```bash
git commit -s -m "your message"
```

That adds a `Signed-off-by: Your Name <you@example.com>` line. It is a
lightweight affirmation, not an assignment of copyright.

## What you can expect from maintainers

- **A first response within 7 days.** If a PR sits longer, a polite nudge on
  the PR is welcome.
- **A clear decision.** When something isn't accepted, we say why, link the
  relevant documentation, and close it rather than leaving it open. One or two
  sentences is enough.
- **Credit.** Contributors are recognised in [`CONTRIBUTORS.md`](CONTRIBUTORS.md)
  and in the release notes for the release that carried their work.

## How much time this project gets

This is a small project run in free hours — expect **a few hours a week** of
maintainer attention. Response-time expectations are set accordingly.

## Commits and pull requests

- Commits are authored as `"VellumScribe Dev" <dev@example.com>` for the
  project's automated work; human contributors commit under their own identity
  and should add a `Signed-off-by` line (`git commit -s`).
- Keep PRs focused; describe **what changed and why** in the PR body.
- Fill in the pull request template — including the accessibility checklist for
  any user-visible change.
