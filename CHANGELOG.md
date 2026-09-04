# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `AUDIT.md` for the full story of how that happened.

## [3.0.0] - 2026-09-04

Comprehensive security hardening, cloud sync integrity, and offline privacy enforcement.

### Added

- **Encrypted Cloud Vault (`CloudBackupCrypto`):** All cloud-destined backups are
  packaged inside a client-side AES-256-GCM encrypted envelope (`VELLUM_ENC_V1`)
  with PBKDF2 key derivation and raw GZIP compression streams before transport.
- **Genuine WebDAV & Nextcloud Integration:** Verified connection flow via HTTP
  `PROPFIND` validation to ensure user credentials and server directories are
  authentic prior to storing account configuration.
- **Enforced Private Offline Mode:** All outbound network calls across Gemini AI,
  Groq, Deepgram, Ollama, cloud synchronization, and the update checker are
  strictly gated behind `PrivacyManager.assertNetworkAllowed()`. In offline mode,
  unauthorized network requests are immediately rejected.
- **Multi-Tenant Session Isolation:** Cloud backup endpoints and accounts in
  `server.ts` are strictly scoped by session identifiers (`x-session-id`), preventing
  any cross-user or multi-tenant backup collision.

### Fixed

- **Eliminated Fabricated 1-Click Cloud Connections:** Removed fraudulent 1-click
  connect claims for Google Drive and OneDrive. Provider connection now requires
  valid OAuth or server-side credentials.
- **Batch Lock Async Race:** Converted `handleBatchLock` in `BatchActionBar.tsx`
  to an asynchronous sequence with proper error handling to prevent silent lock
  failures.
- **Reconciled Version Discrepancies:** Unified application version to `3.0.0`
  across `package.json`, `appUpdateManager.ts`, and project documentation.

## [2.9.0] - 2026-08-27

An audit-and-honesty pass. Nothing in this release adds a new user-facing
feature category; it makes existing features either genuinely work or
honestly say they don't, and removes code that misrepresented what the
app does.

### Fixed

- **Cloud sync no longer fabricates success.** `CloudSyncEngine.triggerSync()`
  previously simulated progress with `setTimeout` delays and never made a
  network call. It now calls `CloudProviderService.uploadBackup()` for
  real, per connected account, and reports failure honestly when an
  upload fails or a provider isn't implemented.
- **Removed a hardcoded placeholder email address** (`CloudConnectModal.tsx`,
  `cloudProviders.ts`) that was used as a default account identity for
  every cloud provider.
- **Cloud "1-click SSO" login was entirely simulated** - a fixed delay
  followed by a fabricated token, with no network request. Replaced with
  a manual-credential flow that verifies a user-supplied token or
  Nextcloud app password against the real provider API before marking an
  account connected. See `CLOUD_PROVIDER_SETUP.md`.
- **AI fallback content was fabricated.** When no Gemini API key was
  configured, OCR scanning returned a fixed, plausible-looking "Action
  Items" block that had nothing to do with the scanned image, and meeting
  summaries invented generic "Key Decisions." Both now say plainly that
  no AI result was generated.
- **"Hardware Keystore" claims were false on the web build.** The
  Settings UI claimed Android Keystore / Apple Secure Enclave hardware
  binding unconditionally. `AndroidKeystoreManager` now actually writes to
  platform secure storage on native Android builds (via
  `@aparajita/capacitor-secure-storage`), and the UI only claims
  hardware-backing when `Capacitor.isNativePlatform()` is true.
- **"SQLite" claims were false everywhere they appeared** (Settings,
  Diagnostics, the What's New dialog). Storage is, and has always been,
  the browser's `localStorage`. UI copy now says so.
- **Version snapshots used a fake checksum** (`Math.random()` labeled
  `sha256:...`). Now computed as a real SHA-256 digest of the note body.
- **PIN hashing and note encryption silently downgraded to a broken
  scheme** (a 32-bit rolling checksum, or reversible XOR) when the Web
  Crypto API was unavailable, while still reporting success. Both now
  fail loudly instead, so a PIN lock never silently provides less
  protection than it claims to.
- **The in-app "Check for Updates" feature always reported "up to date"**
  regardless of whether it could reach anything. It now performs a real
  check against an optional `VITE_UPDATE_MANIFEST_URL` and says plainly
  when no manifest is configured.
- Batch note lock/unlock in `BatchActionBar.tsx` didn't handle a thrown
  error from the storage layer; it now shows the real error instead of
  silently doing nothing.

### Added

- Real backup upload/download for Nextcloud (WebDAV) and OneDrive
  (Microsoft Graph), alongside the existing Google Drive and Dropbox
  implementations.
- `AndroidKeystoreManager` now has a real native code path.
- The previously-unused "What's New" changelog dialog and startup
  migration check are now wired into the app (`App.tsx`).
- Project scaffolding expected of a maintained FOSS project: `README.md`,
  `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `AUDIT.md`, ESLint +
  Prettier config, a Vitest setup with initial unit tests, and a CI
  workflow that typechecks/lints/tests/builds on every push.

### Removed

- ~14 duplicate/orphaned files at the repository root that were never
  part of the actual Vite build (`aiSettings.ts`, `appUpdateManager.ts`,
  `audioRecorder.ts`, `cloudProviders.ts`, `cloudSync.ts`, `cryptoUtils.ts`,
  `geminiService.ts`, `keystore.ts`, `nativeBridge.ts`, `sampleData.ts`,
  `storage.ts`, `types.ts`, `index.css`, `favicon.svg`), plus a stale
  `bun.lock` left over from the same pre-rewrite `package.json`.
- `CloudSyncDashboard.tsx` and `BackupExportModal.tsx` - unused
  components superseded by functionality already built into
  `SettingsView.tsx`.
- A fake SQL-executor "Inspector" method in `storage.ts` that was never
  actually called from any UI.

### Changed

- `package.json`: real project name/description/license/repository
  fields (previously `"name": "react-example"`), added `typecheck`/`lint`/
  `test`/`format` scripts.

See `AUDIT.md` for the full findings this release addresses, including
what's still open.

---

For versions prior to 2.9.0, see `RELEASE_NOTES_2.7.0.md` and
`RELEASE_NOTES_2.8.0.md` (note the correction notices at the top of both),
plus the fuller in-app changelog history in `src/lib/appUpdateManager.ts`.
