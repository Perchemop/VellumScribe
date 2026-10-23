# Contributing to VellumScribe

Thanks for considering a contribution. This is a small project, so the
process is lightweight, but a few conventions matter for keeping the
codebase trustworthy.

## The one rule that matters most

**Never make a feature look like it works when it doesn't.** This
codebase previously had a systemic problem with exactly that: simulated
network calls that reported fake success, a hardcoded placeholder
identity used as a default, UI copy claiming hardware-backed security
that didn't exist, and AI fallbacks that fabricated plausible-looking
content instead of saying "unavailable." See [`AUDIT.md`](./AUDIT.md) for
the full history and [`CHANGELOG.md`](./CHANGELOG.md) for how it was
fixed. Please don't reintroduce this pattern:

- If a feature isn't implemented yet, say so in the UI and/or throw a
  clear error - don't return a plausible-looking fake result.
- If an operation didn't actually happen (a network call failed, wasn't
  attempted, or isn't supported), the return value should say `success:
false` with a real reason, not `true` with fabricated details.
- Don't invent placeholder user data (emails, names, tokens) as a
  "default" - leave the field empty and let the UI ask for it.
- If you're not sure whether a code path can be exercised in production,
  search for its callers before assuming it's fine to leave stubbed. A
  few of the issues in `AUDIT.md` were "fixed" in a file that turned out
  to be dead code never imported by the actual build - grep for the
  export before trusting your fix is live.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Before opening a PR:

```bash
# Edit locally, then verify on GitHub Actions via ci.sh (CI-first, guide §4):
~/.config/opencode/scripts/ci.sh run "<short description>"
# Never run `npm run verify`, `npm test`, or `npm run build` locally.
```

## Code style

- TypeScript, strict-ish. Run `npm run typecheck` - don't introduce new
  errors (some pre-existing `implicit any` warnings exist; fixing them in
  unrelated files is welcome but not required).
- `npm run format` (Prettier) before committing.
- Components live in `src/components/`, one file per modal/view. Core
  logic (storage, crypto, cloud sync, AI service) lives in `src/lib/` and
  should stay UI-framework-agnostic where practical.
- Before adding a new file, check whether something with a similar name
  already exists elsewhere in the tree (see the dead-file problem above).
  `grep -rl ComponentName src/` before assuming a component isn't
  rendered anywhere.

## Testing

Vitest is configured (`npm run test`). Coverage is currently thin (see
`AUDIT.md`) - tests for `src/lib/cryptoUtils.ts` and `src/lib/storage.ts`
are a good starting point if you want to help. Please add or update a
test when you fix a bug in `src/lib/`.

## Good first contributions

These are called out in `AUDIT.md` and `CLOUD_PROVIDER_SETUP.md` as
concrete, bounded next steps:

- **Wire up real 1-click OAuth login.** `src/lib/cloudProviders.ts`
  already has a working PKCE implementation (`getAuthUrl`,
  `exchangeCodeForToken`) that isn't connected to any UI button yet. See
  `CLOUD_PROVIDER_SETUP.md` for what's needed.
- **Replace `localStorage` with IndexedDB (or a real embedded database).**
  Current storage (`src/lib/storage.ts`) is capped by the browser's
  `localStorage` quota (typically 5-10MB), which heavy audio/sketch usage
  can exhaust.
- **Expand test coverage**, especially around `src/lib/storage.ts` and
  the PIN-lock flow in `src/lib/cryptoUtils.ts`.
- **Real conflict detection.** `ConflictResolutionModal.tsx` and the
  conflict data model exist and work, but nothing currently produces a
  real conflict, since sync doesn't yet diff local vs. remote state
  before uploading.

## Reporting a security issue

See [`SECURITY.md`](./SECURITY.md) - please don't open a public issue for
a security vulnerability.

## Commit / PR conventions

- Keep PRs focused; a mix of an unrelated refactor and a bug fix is
  harder to review and to revert if something's wrong.
- Describe _what changed and why_ in the PR body - if you fixed a false
  claim or fabricated behavior, say what it used to do and what it does
  now, the same way `CHANGELOG.md` documents this release.
