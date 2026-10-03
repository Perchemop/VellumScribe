# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `docs/history/RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `docs/history/AUDIT.md` for the full story of how that happened.

## [3.1.0] - 2026-10-03

Real native Whisper build path (upstream whisper.cpp + ggml), dual-mode JNI bridge, and version alignment across Web and Android.

### Added

- **Real Native Whisper Build Path:** Integrated upstream `whisper.cpp` and `ggml` source tree in `android/app/src/main/cpp/third_party/whisper.cpp/` with automatic detection in `CMakeLists.txt` for real NEON/SIMD on-device inference compilation.
- **Dual-Mode JNI Architecture:** Updated `jni_whisper.cpp` with `WHISPER_REAL_INFERENCE_READY` compile flag, providing full greedy sampling, segment text extraction, and real runtime checks when upstream sources are present, with fail-closed stub fallback.
- **Fail-Closed Stub Isolation:** Moved legacy stub headers and shims into dedicated `android/app/src/main/cpp/stub/` directory, eliminating root-level file ambiguity.

### Changed

- **Version Unified to 3.1.0:** Synchronized version across `package.json`, `android/app/build.gradle` (versionCode 31), and `src/lib/appUpdateManager.ts`.
- **CMake STUB vs REAL Modes:** Enforced Android-optimized ggml compilation flags (static libraries, CPU-only, OpenMP disabled) with toggleable `-DVELLUM_WHISPER_REAL=OFF` rollback capability.

## [3.0.0-archive45] - 2026-09-30

Android SSO deep-link plumbing, native OS SpeechRecognizer wiring during audio recording, engine provenance badges, and OAuth cancel/timeout UX hardening.

### Added

- **Android SSO Deep-Link Intent Filters (S-P0.1):** Configured standard custom scheme intent filters (`com.vellumscribe.app://oauth` and `vellumscribe://oauth`) and standards-compliant `autoVerify="true"` HTTPS App Link filters in `AndroidManifest.xml` across production and preview hosts.
- **Native OS SpeechRecognizer in Recording Pipeline (T-P1.1):** Wired `OfflineAi.isSpeechRecognitionAvailable()`, `startListening({ language: 'en-US' })`, `stopListening()`, and `speechRecognitionResult` listener into `AudioRecordingManager.ts` for live on-device dictation during recording sessions.
- **Engine Provenance Badges on Saved Transcripts (T-P1.3):** Updated `TranscriptViewer.tsx` to explicitly identify whether transcripts were generated via Android SpeechRecognizer (OS On-Device), Browser Acoustic Dictation (Offline), Whisper Native, or Cloud Gemini AI.
- **OAuth Cancel & Timeout UX Polish:** Hardened `CloudConnectModal.tsx` with Custom Tabs / Browser finish listeners, active timer cleanup on close, and user-friendly timeout states to prevent indefinite spinners.
- **Automated Tests for OAuth Return & Dictation Events:** Added unit tests verifying PKCE token exchange parameters, OAuth return handling, and live dictation recording events.

## [3.0.0-archive42] - 2026-09-30

UX honesty hardening, transcription recovery sheet pattern, NoteEditor toolbar simplification, PKCE token verification, and durable cloud account persistence.

### Added

- **Transcription Recovery & Alternatives Pattern (UX-P0.2):** Introduced `TranscriptionRecoverySheet` providing transparent engine capability reporting ("GGML Tensor Runtime Pending"), single-click Cloud Gemini transcription fallback, and real-time microphone dictation guidance.
- **Durable Encrypted Cloud Account Storage (server.ts):** Implemented AES-256-GCM encrypted persistence (`persistAccountsToDisk`, `loadPersistedAccountsFromDisk`) so connected accounts across Google Drive, Microsoft, and Nextcloud survive server restarts without exposing tokens.
- **Full PKCE Code Verifier Exchange:** Wired `code_verifier` from client generation through server authorization URLs and into the OAuth token exchange POST requests for Google Drive and Microsoft.
- **Live Dictation Screen-Reader Accessibility (UX-P2.1):** Added `LiveRegion` dynamic announcements (`aria-live="polite"`) for real-time transcription status, progress updates, and dictation text stream.
- **Mobile Direct Navigation Fallback for SSO:** Added graceful direct URL redirection when popup windows are blocked or executing on mobile environments, with post-authentication redirect handling.
- **Offline AI Build Documentation:** Added `OFFLINE_AI_BUILD.md` clearly documenting the current stub vs real upstream ggml/whisper.cpp build architecture.

### Changed

- **NoteEditor Toolbar Simplification (UX-P1.1):** Streamlined toolbar to 3 primary creation actions (Checklist, Voice Memo, AI Summary) and organized secondary actions (Sketch, OCR, Reminder, Geotag, PIN Lock, Markdown Toggle, Share, Pin) into an accessible, non-overflowing "More" actions sheet.
- **Honest Onboarding & Model Download Gating (UX-P0.1 / UX-P0.3):** First-time guide copy truthfully reflects that native tensor inference is pending compile, directing users to live dictation and optional cloud AI; model downloads are disabled with clear explanation until GGML is vendored.

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
