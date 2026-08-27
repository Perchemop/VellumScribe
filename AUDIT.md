# VellumScribe Audit Report

**Date:** 2026-08-27
**Scope:** Full source review of the uploaded `VellumScribe-main` project (~14,700 lines across `src/` plus `server.ts`), performed without the ability to `npm install`, run a build, or execute the app (no network access in the review environment - see "Verification method" at the end).

## Summary

The app is a genuinely well-designed, feature-rich note-taking tool - the
UI, the local data model, the PIN-lock encryption, and the AI-assist
plumbing are all solidly built. The core problem this audit found and
fixed is different: **a systemic pattern of code that fabricated success
instead of implementing the feature or failing honestly.** This wasn't
one or two bugs; it touched cloud sync, cloud login, secure storage, the
local database technology claimed in the UI, the AI fallback content, and
the in-app update checker - and the project's own release notes and setup
docs confidently described fixes that had not actually been applied to
the code that ships.

Everything below is organized as: what was found, why it mattered, and
what was done about it. Severity is rated by what would go wrong for a
real user if this shipped as-is.

---

## Critical findings

### 1. Cloud sync never made a network call

`CloudSyncEngine.triggerSync()` (`src/lib/cloudSync.ts`) simulated the
entire sync flow with `setTimeout` delays and `Math.random()`-generated
metrics (bytes transferred, records downloaded), then reported "Synced!"
regardless of whether anything happened. The real per-provider upload
code in `cloudProviders.ts` existed but **was never called** from this
function. A user connecting a cloud account and tapping "Sync" would see
a convincing progress bar and a success message while nothing left the
device.

**Risk:** data-loss risk. A user who believes their notes are backed up
to the cloud might delete local data, uninstall the app, or lose their
device, and discover there was never a real backup.

**Fixed:** `triggerSync` now calls `CloudProviderService.uploadBackup()`
for real, per connected account, and its returned `success`/`message`
reflect what actually happened - including partial failure when some
providers succeed and others don't.

### 2. "1-click SSO" login was entirely fake, and used a hardcoded placeholder identity

`CloudProviderService.loginWithSso()` (`src/lib/cloudProviders.ts`) and
the "Connect" button in `CloudConnectModal.tsx`/`CloudSyncDashboard.tsx`
did not contact Google, Dropbox, or Microsoft at all. The flow was: show
fake progress messages ("Exchanging OAuth 2.0 PKCE challenge...",
"Securing refresh token in hardware-backed Keystore...") for ~450ms, then
fabricate a token (`sso_tok_${provider}_${Date.now()}`) and mark the
account "connected." **Any typed-in email was accepted as "your
account," with no verification.**

Worse: the default email pre-filled into that form, used whenever the
user left it blank, was a hardcoded, real-looking personal name and
address - `Leonardo.L.Scinto@gmail.com` - appearing 7 times across
`CloudConnectModal.tsx` and `cloudProviders.ts`.

**Risk:** the fake-login pattern is actively deceptive UX (it shows
security-operation language for operations that never happen). The
hardcoded email is a privacy/credibility problem regardless of whether it
belongs to a real person - either way, shipping a stranger's name and
address as a silent default in an open-source project is not acceptable.

**Fixed:** the hardcoded email is removed everywhere. The "Connect" flow
in the rewritten `CloudConnectModal.tsx` now asks for a real credential
(an access token you generate yourself, or a Nextcloud server
URL/username/app password) and calls a new `CloudProviderService
.verifyCredential()` that makes a real API call to the provider before
marking the account connected. See `CLOUD_PROVIDER_SETUP.md`.

### 3. "Hardware Keystore" and "Android Keystore / Apple Secure Enclave" claims were false

Settings UI (`SettingsView.tsx`, `SettingsModal.tsx`) displayed a badge
claiming secrets were protected by "Android Keystore / Apple Secure
Enclave hardware binding" with an "AES-256-GCM" tag. The actual
implementation (`src/lib/keystore.ts`) stored only a masked display
string in `localStorage` - it never touched any platform security API,
on any platform, in any build (there was no native secure-storage plugin
in `package.json` at all).

**Fixed:** `keystore.ts` was rewritten to genuinely use platform secure
storage on native Android builds, via the `@aparajita/capacitor-secure-storage`
plugin (now added to `package.json`) gated behind `Capacitor.isNativePlatform()`.
The UI now conditionally shows "Hardware Keystore Encryption" only on a
native build, and "Local Secret Registry ... not hardware-backed" on the
web build - matching reality in both cases.

### 4. "SQLite" was claimed throughout the UI; actual storage is `localStorage`

Multiple UI surfaces ("Local SQLite Database Storage", "Local SQLite
Database Active", "SQLite Schema v3", plus an "Offline-First
Architectural Engine" description claiming a "background sync worker
computes cryptographic hashes and streams delta changes") described a
SQLite-backed, delta-syncing architecture. `src/lib/storage.ts` is plain
browser `localStorage` with an in-memory cache - no SQLite, no delta
sync, no background worker.

A related dead-code finding: `StorageManager.executeSql()` implemented a
fake "SQL executor" (hardcoded string matching on `FROM EVENTS` etc.,
canned `sqlite_master` responses) for what looked like it was meant to
back a query-console "Inspector" feature. It was never called from any
UI - removed as dead code rather than fixed, since nothing exercises it.

**Fixed:** all four UI strings corrected to describe local browser
storage accurately. The fake SQL executor removed.

### 5. Fabricated AI fallback content

When no Gemini API key was configured, `scanHandwrittenNote()`
(`src/lib/geminiService.ts`) returned a fixed, plausible-looking OCR
result ("Action Items:\n- Review and organize project notes...") that had
nothing to do with the photo the user actually scanned. A user could
easily mistake this for genuinely extracted text. `generateMeetingMinutes()`
had a similar problem: a fabricated "Key Decisions" list unrelated to any
real transcript.

Notably, `server.ts` (the backend proxy) already gets this right - it
returns an honest 503 with a comment explicitly saying "No fabricated OCR
result is returned." The client-side fallback contradicted its own
server's stated policy.

**Fixed:** both fallbacks now say plainly that no AI result was
generated and why, instead of returning fabricated content. The audio
transcription fallback was already honest (an instructional message, not
a fake transcript) and was left as-is.

### 6. Documentation described a different, better codebase than what shipped

`CLOUD_PROVIDER_SETUP.md`, `RELEASE_NOTES_2.7.0.md`, and
`RELEASE_NOTES_2.8.0.md` confidently claimed: real per-provider OAuth
with PKCE, native secure token storage, "no fake success metrics," a real
`VITE_UPDATE_MANIFEST_URL`-based update checker, cleartext traffic
disabled, and CI that validates TypeScript. Point-by-point, none of this
was true of the code actually imported by the app (see finding 7 below
for *why* - it's not that these docs lied maliciously).

The env var names in `CLOUD_PROVIDER_SETUP.md` (`VITE_GOOGLE_CLIENT_ID`
etc.) didn't even match the names used in the shipped `cloudProviders.ts`
(`VITE_GOOGLE_DRIVE_CLIENT_ID` etc.) - a second, independent signal that
the docs and the shipped code had diverged.

**Fixed:** `CLOUD_PROVIDER_SETUP.md` rewritten to describe the real,
current state (see finding 2's fix). `RELEASE_NOTES_2.7.0.md` and
`RELEASE_NOTES_2.8.0.md` were given correction notices at the top rather
than silently rewritten, since they're dated historical documents - the
notices explain exactly what didn't match and point to `CHANGELOG.md` for
what's actually true now. `capacitor.config.json`'s `cleartext`/
`allowMixedContent` flags, which the docs claimed were disabled but
actually weren't, are now genuinely disabled.

### 7. The likely root cause: fixes were made to orphaned duplicate files that were never part of the build

The project root contained a full duplicate set of the `src/lib/` files
(`cryptoUtils.ts`, `keystore.ts`, `cloudProviders.ts`, `cloudSync.ts`,
`storage.ts`, `types.ts`, `geminiService.ts`, `nativeBridge.ts`,
`aiSettings.ts`, `appUpdateManager.ts`, `audioRecorder.ts`, `sampleData.ts`,
plus a duplicate `index.css` and `favicon.svg`). `tsconfig.json`'s
`include` is `["src", "server.ts", "vite.config.ts"]` and every actual
import in the app uses relative paths into `src/` - so **these root files
were never compiled, never bundled, and never executed.**

Comparing them to the real `src/lib/` versions was revealing:
`keystore.ts` at the root contained a genuinely correct, native-aware
implementation using `@aparajita/capacitor-secure-storage` - the fix this
audit ended up writing independently. The root `geminiService.ts` threw
honest errors instead of fabricating OCR/meeting-minutes content - again,
exactly the fix this audit made to the real file. The root
`cloudProviders.ts` had a substantially complete real OAuth
(PKCE + `@capacitor/browser` redirect + native secure token storage)
implementation matching what `CLOUD_PROVIDER_SETUP.md` described.

The most likely explanation: at some point, real fixes for these exact
problems were written - but to the wrong (unbuilt) copy of each file,
and the release notes were written describing that work as if it had
shipped. Nobody (human or AI) ran the actual build against the actual
imported files to catch the mismatch.

**Fixed:** all orphaned root files deleted. Their useful ideas (the
native keystore approach, the honest AI-fallback error messages) were
independently reimplemented directly in the real `src/lib/` files this
time, and verified against the app's actual import graph (see
"Verification method" below). The root `cloudProviders.ts`'s full
browser-redirect OAuth approach was **not** ported wholesale - see "What
was consciously not done" below for why.

**Takeaway for future contributors:** `CONTRIBUTING.md` now says this
explicitly - before trusting a fix, `grep -rl` the file being changed to
confirm something actually imports it.

---

## Other findings and fixes

- **PIN hashing and note encryption silently downgraded to a broken
  scheme.** `cryptoUtils.ts` fell back to a 32-bit rolling-checksum hash
  (trivially brute-forced) for PIN verification, and a reversible XOR
  "encryption" for note content, whenever the Web Crypto API wasn't
  available - while still reporting success. **Fixed:** both paths now
  throw a clear error instead, so a lock never silently provides less
  protection than it claims. In practice this fallback path is very rare
  (essentially every current browser/WebView has Web Crypto), but a
  security feature that can silently downgrade itself is a real risk if
  it ever does trigger.
- **Version snapshot checksums were fake.** `saveVersionSnapshot()` in
  `cloudSync.ts` labeled a `Math.random()` string `sha256:...`. **Fixed:**
  computes a real SHA-256 digest of the note body via
  `crypto.subtle.digest`.
- **The in-app "Check for Updates" always said "up to date."**
  `checkForRemoteUpdates()` in `appUpdateManager.ts` was hardcoded to
  return `isUpToDate: true` after an artificial delay, regardless of
  whether it checked anything. **Fixed:** performs a real fetch against
  an optional `VITE_UPDATE_MANIFEST_URL`, and says plainly when no
  manifest is configured rather than claiming to have checked.
- **In-app "What's New" changelog and the update/migration system were
  entirely dead code.** `AppUpdateModal.tsx` and the migration-checking
  logic in `appUpdateManager.ts` were never rendered or called from
  `App.tsx`. Its content also contained the same category of false
  claims as the other docs ("Eliminated mock sync simulations," "Live
  Cloud Storage Provider Integrations"). **Fixed:** the changelog content
  was corrected, and the modal + startup migration check are now wired
  into `App.tsx` for real, guarded against React StrictMode's dev-mode
  double-invoke.
- **Two more fully-dead, duplicate UI components.**
  `CloudSyncDashboard.tsx` (394 lines) had its own, separate, even more
  blatant fake-connect flow (typing any string into an email box
  instantly marked a cloud account connected, no verification at all)
  and was never rendered anywhere. `BackupExportModal.tsx` (197 lines)
  duplicated export functionality already built inline into
  `SettingsView.tsx`. **Fixed:** both deleted.
- **`batchLockNotes`/`batchUnlockNotes` call sites didn't handle
  errors.** `BatchActionBar.tsx` called these without `await` (lock) or
  without a `try/catch` (unlock), so a thrown error (now more likely
  given the crypto fail-loudly change above) would silently fail with no
  user feedback. **Fixed:** both are now properly awaited with error
  states shown in the UI.
- **`package.json` had placeholder metadata** (`"name": "react-example"`,
  no `license`/`description`/`repository`, no `test`/`lint` scripts
  beyond a bare `tsc --noEmit`). **Fixed:** real metadata, and
  `typecheck`/`lint`/`format`/`test`/`verify` scripts.
- **`capacitor.config.json` allowed cleartext HTTP and mixed content**,
  which release notes claimed was disabled. **Fixed:** both set to
  `false`; see finding 6.
- **No tests, no linter, no CI beyond an APK build, no README/LICENSE/
  CONTRIBUTING/SECURITY.** See "FOSS scaffolding added" below.

---

## FOSS scaffolding added

None of the following existed before this pass:

- `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CHANGELOG.md`.
- `eslint.config.js` (flat config, typescript-eslint + react-hooks +
  react-refresh) and `.prettierrc.json`.
- `vitest.config.ts` + `vitest.setup.ts` (polyfills `crypto.subtle` for
  jsdom, since the intentional fail-loudly crypto behavior above needs a
  real Web Crypto implementation in tests) + initial unit tests:
  - `src/lib/cryptoUtils.test.ts` - salt generation, hex round-trip, PIN
    hash/verify (including legacy plaintext migration), and note
    payload encrypt/decrypt round-trips including wrong-PIN rejection.
  - `src/lib/storage.test.ts` - event/note CRUD, archive/trash/restore,
    cascading delete, cross-reload persistence, and the PIN-lock flow
    end-to-end.
- `.github/workflows/ci.yml` - typecheck + lint + test + build on every
  push/PR (fast, no Android toolchain needed).
- `.github/workflows/build-apk.yml` - added a typecheck gate, and
  conditional release-signing steps that only run if the relevant
  secrets are configured, so a tagged release is labeled "debug build,
  unsigned" rather than silently shipping a debug APK as if it were
  signed (see finding 6).

## Dead code removed

- 14 orphaned duplicate files at the repository root (finding 7), plus a
  stale `bun.lock` that referenced the same old `"react-example"` package
  name and no longer matched anything.
- `CloudSyncDashboard.tsx`, `BackupExportModal.tsx` (unused components).
- `StorageManager.executeSql()` (unused fake SQL engine).
- Unused `forceSimulateError`/`forceSimulateConflict` options in
  `triggerSync` (never referenced from any UI).
- A stale `package-lock.json` that didn't match the (also stale)
  `package.json` it shipped with (still referenced `"name":
  "react-example"` and an unused `@types/sql.js`) - removed rather than
  left to break `npm ci`. A fresh lockfile should be committed after the
  first real `npm install`.

---

## What was consciously not done

Given the review environment has no network access (no `npm install`, no
build, no way to run the app - see below), some larger changes were
judged too risky to make blind:

- **A full browser-redirect OAuth login flow was not wired up.** The
  orphaned root `cloudProviders.ts` had a substantially complete
  implementation using `@capacitor/browser` and a custom URL scheme
  callback, but wiring it in for real requires a callback route/listener,
  two more native dependencies, and registered OAuth apps to test
  against - none of which could be verified here. Instead, this pass
  implemented a lower-risk, fully real alternative (manual token/WebDAV
  credential entry with live verification) and left the redirect-flow
  scaffolding (`getAuthUrl`/`exchangeCodeForToken`/PKCE helpers) in place,
  documented in `CLOUD_PROVIDER_SETUP.md` as a concrete "good first
  contribution."
- **Storage was not migrated off `localStorage`.** This is a real,
  known scaling limitation (see `README.md`), but a storage-engine
  migration is a large, high-risk change to make without the ability to
  run the app end-to-end. Documented instead as a recommended
  contribution.
- **Cloud account credentials are not yet routed through the native
  secure-storage path** added for `AndroidKeystoreManager` - they still
  live in the plain `CloudAccount` record in `localStorage`. Documented
  in `SECURITY.md` as an open item rather than silently left unmentioned.
- **The internal `SQLiteDatabase` export alias** (`src/lib/storage.ts:
  export const SQLiteDatabase = StorageManager;`, used as an import name
  in 4 component files) was left in place rather than renamed everywhere.
  It's an internal identifier, not user-facing, and renaming it touches
  several files with no functional benefit - lower priority than the
  user-facing string fixes, called out here so it isn't mistaken for an
  oversight.
- The React/Capacitor/AI SDK type-checking noise inherent to reviewing
  this project without `node_modules` (see below) was not "fixed" -
  it's an artifact of the review environment, not the code.

---

## Verification method

The review environment had no network access, so `npm install` could not
be run, and neither could a real build, lint, test, or the app itself.
To still catch syntax errors and type regressions, every changed file was
checked with a standalone TypeScript compiler run
(`tsc --noEmit --skipLibCheck ...`) against the real `tsconfig.json`
settings, without `node_modules` present. This produces a large but
*stable* baseline of expected errors (missing `react`/`lucide-react`/
Capacitor package types, cascading "implicit any" from unresolved JSX
types) - none of which are real bugs, just an artifact of no
`node_modules`.

Before making changes, a full-project baseline error histogram was
captured. After each change, and again at the end of this pass, the same
check was re-run and diffed against that baseline. The result: **the
final error histogram introduced zero new error categories**, and every
count increase is proportional to the genuinely new code added (more
JSX, more untyped fetch-response handling in the same style as the
surrounding code). One pre-existing type error (`TS2322`, a
`BufferSource` strictness issue in `cryptoUtils.ts`'s AES-GCM decrypt
call) was fixed as a side effect of the crypto rewrite.

This is a real, if partial, safety net - it catches syntax errors,
import-graph breakage, and type mismatches within the code itself, but it
is **not a substitute for actually running `npm install && npm run
verify` and exercising the app**, which whoever picks this up next should
do before merging. The Vitest test files in particular have not been
executed, only read carefully and reasoned through against the exact
current implementation of `cryptoUtils.ts`/`storage.ts` they test.

## Suggested next steps for a maintainer

1. `npm install` (this will also generate a fresh `package-lock.json` -
   please commit it).
2. `npm run verify` - confirm typecheck/lint/test all actually pass; fix
   anything this review's static analysis couldn't catch.
3. Spot-check the cloud provider connect flow manually against a real
   Google Drive/Dropbox/OneDrive access token and a real Nextcloud
   instance.
4. Verify the Android release-signing steps in `build-apk.yml` against a
   real keystore before relying on it (see the note in that file).
5. Review the "What was consciously not done" list above and prioritize.
