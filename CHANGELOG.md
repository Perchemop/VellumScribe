# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `docs/history/RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `docs/history/AUDIT.md` for the full story of how that happened.

## [Unreleased]

### Added

- **Wider rendered evidence** in `tests/visual.spec.ts`: the Settings → About
  panel (desktop and 390px phone, the phone leg reached through the bottom nav
  as m-7 evidence), the in-app delete confirmation (asserting that no native
  dialog fires), a forced-colours landing capture (asserting the theme toggle
  keeps a system-coloured 1px border), a dense virtualised notes list, and a
  pre-first-paint theme test (a stored light/dark preference must apply the
  `<html>` class, `theme-color` and the splash surface). Verified green on
  PR #147 (all required checks, merged to `main` as `8b66bfb`).
  **Extended** in PR #152 with: empty state in dark mode, settings → Diagnostics
  dark mode, editor dark mode at 640px phone viewport, and focused state capture
  verifying focus rings on editor body input.
- **Contract tests** for the audit fixes: `src/design/brandContract.test.ts`
  (web icons stay byte-identical copies of `assets/brand/`, the first-paint
  bootstrap stays in lockstep with `AppContext`, and no UI source may open a
  blocking browser `confirm` dialog) and `src/components/BrandMarkGlyph.test.tsx`
  (canonical geometry, ARIA behaviour, drift guard against the canonical SVG).

### Changed

- **The brand mark has a single source:** the new `BrandMarkGlyph` component
  carries the mark geometry, `AppLogo` uses it, and Settings → About shows the
  real mark instead of a letter "V" (audit m-2).
- **Favicons are generated, not hand-copied:**
  `scripts/generate-brand-assets.mjs` now also copies
  `assets/brand/vellumscribe-mark.svg` → `public/favicon.svg` and the maskable
  variant → `public/maskable.svg`; the first-paint splash in `index.html`
  renders `/favicon.svg` instead of an inline copy (audit m-1).
- **No theme flash at first paint:** an inline head script applies the stored
  theme (same `localStorage` key and JSON shape as `AppContext`) before first
  paint and themes the splash (light `#fafaf9` / dark `#121215`); `AppContext`
  keeps `meta[name=theme-color]` in step (audit m-4).
- **Forced-colours (high-contrast) support:** a `@media (forced-colors: active)`
  layer in `src/index.css` gives controls system-coloured edges and an explicit
  focus outline, and removes decorative shadows (audit m-6).
- **Mobile bottom-nav labels** are 11px (was 10px) with stable ids and
  `aria-current` on the active item (audit m-7).

### Fixed

- **Note delete in the editor no longer uses a blocking `window.confirm`:** it
  opens the in-app confirmation dialog used elsewhere; Escape closes the editor
  sheets and the confirmation, and the destructive confirmation sits on the
  Android back stack (audit M-3).
- **The same blocking dialog in Settings → Offline AI is gone:** "Remove this
  speech model?" now uses the in-app confirmation (focus trap, back stack, and
  an accessible name on the icon-only remove button).
- **Location denial is honest (audit §4 item 3):** when the browser blocks or
  fails geolocation, the editor's location picker explains what happened and
  stays open — it no longer silently writes a fake "Current device location"
  onto the note.
- **Last ring-less control (audit S-1 family):** the mobile sort `<select>` in
  the notes list shows a keyboard focus ring and carries an accessible name.
- **Camera and microphone denial are explained:** `src/lib/permissionFailure.ts`
  classifies blocked and missing-device errors, and both `OcrScannerModal` and
  `AudioRecordingModal` show a plain-language notice with a usable fallback
  (gallery/upload or device settings) instead of a generic failure. Covered by
  `src/lib/permissionFailure.test.ts`.
- **Store banner PNG (m-5):** added `scripts/rasterize-banner.mjs` using
  `rsvg-convert`, and committed `metadata/fdroid/feature-graphic.png`
  (1024×500) for store submissions; Q-022 resolved.

### Removed

- Dead code and unused dependencies: the never-imported
  `src/components/note-editor/RichBodyEditor.tsx`, and the `motion` and
  `react-markdown` dependencies. `package-lock.json` is pruned accordingly and
  its version field is back in step with `package.json` (3.1.0 → 3.1.1)
  (audit m-3).

Still open from the design audit: on-hardware a11y spot-check (pending device
build). CI verification for this slice is pending.

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
