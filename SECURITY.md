# Security

This document describes VellumScribe's actual security model, including
its real limitations. If something here reads as a caveat rather than a
feature, that's intentional - see `AUDIT.md` for why we'd rather
under-promise here than repeat the app's previous history of overstating
what it protects against.

## Reporting a vulnerability

Please report security issues privately rather than opening a public
GitHub issue - open a private security advisory on the repository
(GitHub: **Security -> Advisories -> Report a vulnerability**), or, if
that isn't available, contact the maintainers directly through a channel
listed on the repository's main page. Include steps to reproduce and the
version/commit you tested against. We'll do our best to acknowledge
promptly and fix confirmed issues; this is a small project without a
dedicated security team or a bounty program.

## Data storage model

- All relational note data lives in an embedded **SQLite database (`sql.js` WebAssembly)** on the device where it was created (see `src/lib/storage.ts` and `src/lib/sqliteEngine.ts`). There is no remote central database and no note data leaves the device unless you explicitly connect a cloud backup destination.
- **Persistence layer**:
  - On web builds, the SQLite database snapshot is persisted as a binary blob in **IndexedDB** (`idb-keyval`).
  - On native Android builds, the SQLite database is written to private application storage (`vellumscribe.db`) via the Capacitor Filesystem.
- **Dual-database crash recovery**: A shadow backup snapshot (`vellumscribe_backup.db`) is kept alongside the primary database. On boot, SQLite integrity is verified; if corruption is detected, auto-recovery restores the last valid snapshot.
- **Out-of-band binary media store**: Heavy binary assets (voice audio memos, camera OCR scans, canvas drawings) are stored in discrete binary storage via `MediaRepository` and `SecureMediaRepository` (IndexedDB blobs on web, files on Android) rather than clogging SQLite relational rows.
- The Express server (`server.ts`) is a thin local proxy for Gemini AI requests and does not persist any note or user data.

## Note protection: PIN, Passphrase & Private Lock

- Locking a note encrypts its content using **AES-256-GCM**, with encryption keys derived via **PBKDF2-HMAC-SHA-256 (210,000 iterations)** using a cryptographically secure random 16-byte salt (see `src/lib/cryptoUtils.ts`).
- **Two lock modes**:
  - **Standard Lock**: Encrypts note body, checklist items, sketch payload, and voice attachments. The note title and tags remain visible in the note list for indexing and navigation.
  - **Private Lock**: Encrypts the title, tags, and body into the AES-256-GCM envelope. The note title is masked as "🔒 Locked Note" and tags are stripped in the database record, completely concealing note topics and metadata from shoulder-surfers, list views, and search scrapers.
- **PIN vs Passphrase threat model**:
  - **A short numeric PIN is inherently low entropy.** A 4-digit PIN has only 10,000 possible values; PBKDF2's iteration count slows down each guess, but cannot turn a 4-6 digit numeric PIN into a strong secret against an attacker with physical access to raw storage who can perform offline brute-force attacks. Treat PIN-locking as defense against casual/opportunistic physical access (someone picking up an unlocked phone).
  - For sensitive records, choose **Passphrase** security with high entropy (12+ characters, mixed case, symbols), which provides genuine cryptographic defense against offline brute-force attacks.
- **Session key management**: Unlocked note keys are held exclusively in volatile memory (`UnlockSessionManager`) and are never written to disk. Closing or reloading the session clears the decrypted cache.
- If the Web Crypto API is unavailable on your device/browser, locking or unlocking will fail with an explicit error rather than falling back to an unverified or weak cipher.

## Cloud backup & credential security

- **Secure keystore management**: Secrets and API keys are managed through `AndroidKeystoreManager` (`src/lib/keystore.ts`).
  - On native Android builds, secrets are written directly to platform secure storage (**Android Keystore**) via `@aparajita/capacitor-secure-storage` with `hardware_backed: true`.
  - On web builds, raw credentials reside in volatile in-memory session storage (`runtimeSessionSecrets`), while only masked metadata descriptors are retained for UI display.
  - On startup, `migrateLegacyCredentials()` automatically migrates any unencrypted tokens from legacy localStorage into the Keystore and purges the plaintext records.
- **End-to-end client-side encryption**: Backup snapshot archives (`vellumscribe_backup.json.gz`) are compressed and encrypted locally using AES-256-GCM before transport. Remote cloud storage providers (Google Drive, Microsoft OneDrive, Nextcloud, WebDAV, or Encrypted Vault) only ever store ciphertext blobs.
- **Log sanitization**: All log messages passing through `AppLogger` (`src/lib/logger.ts`) are automatically scanned and redacted to prevent inadvertent leaking of API keys, bearer tokens, or sensitive payload fragments.

## Network security (Android)

- The native Android build disables cleartext (plain HTTP) traffic and mixed content (`capacitor.config.json`). Connecting a self-hosted Nextcloud/WebDAV server from the Android app requires HTTPS.

## AI features

- OCR, transcription, meeting-summary, and conflict-merge features send the relevant content (an image, audio, or text) to Google's Gemini API, either via this app's own server proxy (if `GEMINI_API_KEY` is configured there) or directly using a custom key configured in Settings.
- When no API key is configured, these features report that plainly rather than fabricating a plausible-looking result.

## Known open items

- Web platform cannot provide hardware-backed keystore semantics (inherent limitation of standard browser sandboxes; secrets remain in volatile session memory).
- Automated adversarial penetration test suites are not yet configured in CI.
