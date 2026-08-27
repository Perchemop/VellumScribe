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

- All note data lives in the browser's `localStorage` on the device
  where it was created (see `src/lib/storage.ts`). There is no server-side
  database and no data leaves the device unless you explicitly connect a
  cloud backup provider.
- `localStorage` is **not encrypted at rest by the browser**. Anyone with
  access to the device/browser profile (or a malicious browser extension
  with broad permissions) can read it, except for the body/checklist/
  sketch content of notes you've explicitly PIN-locked (see below).
- The Express server (`server.ts`) is a thin proxy for Gemini AI requests
  and does not persist any note data.

## PIN-protected notes

- Locking a note encrypts its body, checklist, and sketch content with
  **AES-256-GCM**, with the key derived from your PIN via
  **PBKDF2-HMAC-SHA-256, 210,000 iterations** (see
  `src/lib/cryptoUtils.ts`).
- **A short numeric PIN is inherently low entropy.** A 4-digit PIN has
  only 10,000 possible values; PBKDF2's iteration count slows down each
  guess but cannot turn a 4-6 digit PIN into a strong secret against an
  attacker who has a copy of the encrypted note data and can brute-force
  offline. Treat note PIN-locking as protection against casual/opportunistic
  access (someone picking up your unlocked device), not as protection
  against a determined attacker with a copy of your browser storage. Use
  a longer, non-numeric PIN where the UI allows it if you need stronger
  protection.
- If the Web Crypto API is unavailable on your device/browser, locking or
  unlocking a note will fail with an explicit error rather than silently
  falling back to a weaker scheme. Earlier versions of this code did the
  latter (see `AUDIT.md`); this was changed because a fallback that
  fabricates a false sense of security is worse than a feature that
  plainly doesn't work.

## Cloud backup credentials

- Cloud provider credentials (OAuth access tokens, or a Nextcloud app
  password) are currently stored **in plain text** as part of the account
  record in `localStorage` on web builds. This is a known limitation - see
  the open item below.
- On native Android builds, secrets saved through `AndroidKeystoreManager`
  (`src/lib/keystore.ts`) are written to the platform secure storage
  (Android Keystore) via `@aparajita/capacitor-secure-storage`. This does
  **not** currently cover cloud account credentials specifically (those go
  through `CloudSyncEngine`/`localStorage`, not through the keystore) -
  closing that gap is an open item.
- Cloud credentials never leave your device except in direct API calls to
  the provider you connected (Google, Dropbox, Microsoft, or your own
  Nextcloud server) - see `src/lib/cloudProviders.ts`. There is no
  VellumScribe-operated backend that sees your credentials or note
  content.
- See `CLOUD_PROVIDER_SETUP.md` for exactly what each provider connection
  does and does not verify.

## Network security (Android)

- The native Android build disables cleartext (plain HTTP) traffic and
  mixed content (`capacitor.config.json`). Connecting a self-hosted
  Nextcloud/WebDAV server from the Android app requires HTTPS.

## AI features

- OCR, transcription, meeting-summary, and conflict-merge features send
  the relevant content (an image, audio, or text) to Google's Gemini API,
  either via this app's own server proxy (if `GEMINI_API_KEY` is
  configured there) or directly from your browser using a key you paste
  into Settings. Review Google's data-handling terms for the Gemini API
  if this matters for your use case.
- When no API key is configured, these features report that plainly
  rather than fabricating a plausible-looking result - see `AUDIT.md` for
  why this matters (fabricated OCR/summary content could otherwise be
  mistaken for real extracted/summarized content).

## Known open items

- Cloud credentials are not yet routed through the native secure storage
  path (see above).
- No content security policy / dependency vulnerability scanning is
  currently configured in CI.
- No automated security-focused test suite; current tests
  (`npm run test`) cover core crypto/storage correctness, not adversarial
  scenarios.

Contributions addressing any of the above are welcome - see
`CONTRIBUTING.md`.
