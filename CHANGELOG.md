# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `docs/history/RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `docs/history/AUDIT.md` for the full story of how that happened.

## [Unreleased]

_No unreleased changes yet._

## [3.1.1] - 2026-10-30

Release-readiness: signed installable APKs, F-Droid packaging, opt-in crash
reporting and metrics, stronger accessibility, and dual licensing.

### Added

- **Signed release APKs:** a stable release keystore is wired to CI, so
  `assembleRelease` produces an APK that can replace an installed copy
  (`signed=true`; Q-002 resolved). See `docs/RELEASE_KEYSTORE.md`.
- **F-Droid packaging:** `metadata/fdroid/metadata.yml` and a submission guide
  (`docs/FDROID.md`); ProGuard mapping artefacts are kept in CI.
- **Crash reporting (opt-in, bring-your-own-token):** a redacted, consent-gated
  report from the error screen; add a personal GitHub token in Settings →
  Advanced to file issues directly, or use the prefilled-issue fallback.
- **Usage metrics (opt-in, local-only):** anonymous counters for release health,
  disabled by default (Settings → Privacy). No note content, no PII.
- **Native transcription crash trail:** the Android whisper worker records a
  breadcrumb before every processing stage (job start, model load, engine init,
  segmentation, each inference chunk) in app storage. After an unexpected
  process death, the next launch surfaces that trail through AppLogger, so
  Settings → Diagnostics → **Export logs (JSON)** shows exactly how far the
  previous run got. Diagnostics only — no behavioural change.
- **Self-reporting interruption banner:** if the previous session stopped during
  offline transcription, the app now says so on launch in plain language, names
  the exact stage, and offers the raw trail with a **Copy diagnostics** button —
  no log hunting, and no developer skills needed to report it. Dismissible and
  non-blocking.
- **Version 3.1.1** (web, Android `versionName`, and the runtime update manager
  in step), so an installed build can be identified unambiguously from Android's
  app info.

### Security

- **Cloud OAuth tokens no longer touch plain local storage:** provider access
  tokens are moved into the Keystore (native secure storage on Android) and only
  the credential-free account record is persisted. The client never read these
  tokens back — authenticated requests go through the server session — so the
  plaintext copy was pure risk. Disconnecting an account also clears its stored
  credential.
- **OAuth callback error page escaping:** the error text and provider value are
  JSON-escaped for the inline script context, closing a `</script>` breakout and
  a quote-breakout in the provider string literal.
- **Cloud backup upload validation:** the `filename` parameter is accepted only
  as a string, so a tampered payload cannot influence URL building.
- **CodeQL triage 2026-10-26:** 30 alerts investigated in full — real findings
  fixed as above, and the provably benign set (rate-limit false positives,
  typed-array writes, non-credential storage) dismissed with written reasons.
  See D-422.
- CodeQL hardening on the server proxy: rate limiting, CORS credential
  isolation, validated outbound URLs, prototype-pollution guard, and
  XSS/ReDoS fixes.

### Changed

- **Licence:** **plain MIT** (single). The dual **MIT OR Apache-2.0**
  expression introduced on 2026-10-24 is reverted by owner decision (D-424);
  `LICENSE`, `package.json` and the F-Droid metadata now all state MIT,
  matching the README and CONTRIBUTING wording.
- **Accessibility:** light-mode small text now meets WCAG 2.2 AA contrast;
  visible keyboard focus restored on primary inputs; `prefers-reduced-motion`
  is honoured; the batch action bar uses correct light-mode colours.
- **App logo and maskable PWA icon** are consistent across light/dark themes.

### Fixed

- Asset Links fingerprint filled in from the release keystore (Q-003 resolved).
- `AndroidKeystoreManager.deleteSecret` now clears the in-memory secret and
  reports whether an entry existed.

## [3.1.0] - 2026-10-03

Real native Whisper build path (upstream whisper.cpp + ggml), dual-mode JNI bridge, and version alignment across Web and Android.

### Added

- **Real Native Whisper Build Path:** Integrated upstream `whisper.cpp` and `ggml` source tree in `android/app/src/main/cpp/third_party/whisper.cpp/` with automatic detection in `CMakeLists.txt` for real NEON/SIMD on-device inference compilation.
- **Dual-Mode JNI Architecture:** Updated `jni_whisper.cpp` with `WHISPER_REAL_INFERENCE_READY` compile flag, providing full greedy sampling, segment text extraction, and real runtime checks when upstream sources are present, with fail-closed stub fallback.
- **Fail-Closed Stub Isolation:** Moved legacy stub headers and shims into dedicated `android/app/src/main/cpp/stub/` directory, eliminating root-level file ambiguity.
- **Vendor Whisper workflow:** `.github/workflows/vendor-whisper.yml` clones full upstream and commits it to `main` (mobile-friendly).
- **APK workflow STUB/REAL input:** Build Android APK accepts `whisper_mode=stub|real`.
- **Priority status doc:** `docs/PRIORITY_STATUS_3.1.0.md`.

### Changed

- **Version Unified to 3.1.0:** Synchronized version across `package.json`, `android/app/build.gradle` (versionCode 31), and `src/lib/appUpdateManager.ts`.
- **CMake STUB vs REAL Modes:** Enforced Android-optimized ggml compilation flags (static libraries, CPU-only, OpenMP disabled) with toggleable `-DVELLUM_WHISPER_REAL=OFF` rollback capability.
- **App Links:** HTTPS intent filter includes `/oauth` path prefix in addition to `/api/cloud`.
- **CI:** Verifies Whisper source gate files; defaults APK builds to stub for reliability.

## [3.0.0-archive45] - 2026-09-30

Android SSO deep-link plumbing, native OS SpeechRecognizer wiring during audio recording, engine provenance badges, and OAuth cancel/timeout UX hardening.

### Added

- Deep-link OAuth return paths and Browser-based SSO flow hardening.
- Transcription recovery sheet and honesty gating for offline engines.
