# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `docs/history/RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `docs/history/AUDIT.md` for the full story of how that happened.

## [3.2.0] - 2026-11-14

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
- **Release Notes popup, opened from a subtle bottom-right version chip.** The
  running version now sits on its own, quietly, in the bottom-right corner
  (`VersionFootprint`); clicking it opens the standard suite Release Notes popup
  (`ReleaseNotesModal`): version history, per-release app usage, token metrics,
  and an Update action that links to the release page. The Update link is
  https-only with a documented safe fallback, the popup never auto-installs
  anything, and the usage section states plainly when metrics recording is off
  (opt-in, on-device). Covered by `src/lib/releaseNotes.test.ts` and
  `src/components/releaseNotesContract.test.tsx`.
- **CI-managed token ledger (guide §12.1).** `docs/tokens.json` records the
  suite token metrics (`total_tokens_since_start`, `release_tokens`,
  `release_version`), `scripts/tokens-ledger.ts` updates it, and the tag-triggered
  `release.yml` now appends the ledger's `### Token metrics` section to the
  published release body and proposes the ledger update as a pull request.
  A figure of `0` means _not measured_ and is rendered as words wherever it
  appears — never as a measurement. `workflow_dispatch` runs the same CLI as a
  read-only dry run, and `docs/suite-standards.md` records how every §12.1 suite
  standard maps onto this (non-Rust) app, including the deliberate deviation
  that there is no in-app self-update.

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

- **Dependencies brought up to date (2026-11-13):** the grouped Dependabot
  updates landed on `main` — `react` + `react-dom` together to 19.3.1,
  `@capacitor/*` (android/cli/core 8.6.0, app 8.1.2, camera 8.2.6),
  `vite` 8.3.7, `@vitejs/plugin-react` 6.3.0, `@tailwindcss/vite` 4.3.5,
  `jsdom` 31.0.0, `lucide-react` 1.71.0, `dotenv` 18.0.10, `eslint` 10.14.0,
  `vitest` 5.1.0, and the grouped security update `glob` 13.0.6 → 14.0.6
  (merges on `main` `f6db088`: CI `43414252378`, Security Scanning
  `43414252497`, Android APK `43414252325`, all green).
- **Dependabot can no longer split React:** `.github/dependabot.yml` now groups
  `react`, `react-dom` and `@types/react*` into one PR, and `@capacitor/*`
  into one mobile-shell PR. React requires `react` and `react-dom` to be the
  exact same version, which is what made PR #170 (a `react`-only bump) fail
  every `verify` job and the visual job; #170 is closed and superseded by the
  grouped PR (D-428).
- **GitHub Actions brought to current majors:** `github/codeql-action` v3 → v4
  (Node 24 runtime; v3 is deprecated in December 2026),
  `gitleaks/gitleaks-action` v2 → v3 (Node 24 runtime only — it still pins
  gitleaks 8.24.3, so the `.gitleaks.toml` allowlist from D-427 is unchanged),
  `actions/dependency-review-action` v4 → v5, `actions/upload-artifact`
  4.6.2 → 7.0.2 (the `visual.yml` pin moves v4.6.2 → v7.0.2; every input the
  workflows pass is unchanged).
- **The sql.js WASM pair is generated at build time, not committed.**
  `public/sql-wasm.js` / `public/sql-wasm.wasm` are copied from
  `node_modules/sql.js` by `scripts/vendor-sql-wasm.mjs` (npm runs it via
  `prebuild` / `prebuild:spa`), so the JavaScript glue the bundler ships and the
  binary the app force-serves can never come from different sql.js builds — the
  drift that made the 1.16.0 bump fail to boot. The two files are no longer
  tracked in git (`docs/BUILD_RELEASE.md` §3).

### Fixed

- **Backup import no longer silently drops events.** `saveEvent` decided
  "existing" from the record's id alone, so restoring a backup whose events
  carry ids not yet in the database matched **0 rows** and imported nothing —
  the notes then referenced an event that was never created. The import only
  appeared to work because a sql.js quirk silently disabled foreign-key
  enforcement. `saveEvent` is now a true upsert (existence is queried; an
  explicit id is preserved on insert so references resolve), covered by
  regression tests, and the same audit cleared the recording/transcript/OCR
  savers. Side effect worth knowing: the demo sample events also carry explicit
  ids, so on a fresh database they were all silently dropped — this fix repairs
  that path too.
- **Foreign-key enforcement is now real, not accidental.** sql.js ≤ 1.14.2
  silently reset `PRAGMA foreign_keys` inside `export()`, so the engine's
  stated policy (`foreign_keys = ON`) quietly lapsed after the first export.
  The engine re-asserts the pragma after every export, and the tests that
  deliberately plant dangling foreign keys suspend enforcement only around
  those inserts.
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
- **Native Whisper no longer kills the app at the first inference.** The
  on-device trail ended at `INFER_BEGIN` because three defects compounded:
  (1) `nativeInit` left `flash_attn` at its new `true` default, so a CPU-only
  device built the GPU-oriented flash-attention graph (`ggml_flash_attn_ext`);
  (2) `nativeTranscribe` set `detect_language = true` for `"auto"`, which makes
  `whisper_full` run language detection only and return before transcribing;
  and (3) a C++ exception escaping the `extern "C"` JNI boundary calls
  `std::terminate` → `abort()`. The JNI now forces `flash_attn = false` for the
  CPU build, uses the documented auto-language parameters, wraps every whisper
  call in `try`/`catch` so `std::bad_alloc` and engine errors arrive as normal
  Java exceptions, installs a signal handler that appends the faulting signal
  and a native backtrace to the existing breadcrumb file, and routes
  whisper.cpp's log stream to logcat. `TranscriptionWorker` gains a memory
  headroom gate (fails honestly with `OFFLINE_AI_OUT_OF_MEMORY` instead of a
  doomed run) and catches `Throwable` so engine `Error`s become failure
  results, and `OfflineAiManager.mapErrorCodeToUserMessage` keeps the worker's
  specific sentences and maps the new codes.

### Removed

- Dead code and unused dependencies: the never-imported
  `src/components/note-editor/RichBodyEditor.tsx`, and the `motion` and
  `react-markdown` dependencies. `package-lock.json` is pruned accordingly and
  its version field is back in step with `package.json` (3.1.0 → 3.1.1)
  (audit m-3).

### Security

- **The weekly full-history secret audit is triaged and green.** The
  `Security Scanning` → `secret scan` job failed twice on `main` (runs
  `41440884939`, `42617404430`): `gitleaks/gitleaks-action@v2` audits the whole
  history on a `schedule` (or dispatch) run, while its push and pull-request
  runs scan only the pushed commit range — so findings that live only in
  history had never been triaged. All 13 findings are now classified, each with
  its reason, and covered by a minimal `.gitleaks.toml` allowlist: vendored
  `whisper.cpp` CI cache keys, the generated Capacitor bundle, the application's
  own storage-key _names_ (never a credential value), and bounded line shapes
  for retired synthetic fixtures (guide II.29.2). An allowlist entry without a
  recorded reason is a defect, and the allowlist must never mask a credential.
  Verified by a full-history `workflow_dispatch` run on `main` — run
  `43394163146`, 456 commits scanned, `no leaks found`.
- **Generated Capacitor output is no longer committed** (39 files, ~2.6 MB):
  `android/app/src/main/assets/public/**`, `assets/capacitor.config.json` and
  `assets/capacitor.plugins.json` are produced by `npm run build:spa` +
  `npx cap sync android`. The committed copy drifted from source and was itself
  a source of scanner noise; `.github/workflows/build-apk.yml` already
  regenerates it before gradle, and `docs/BUILD_RELEASE.md` now states the rule
  for a fresh clone.
- **The F-Droid recipe regenerates the web layer too:**
  `metadata/fdroid/metadata.yml` gained a `prebuild` step (`npm ci` +
  `npm run build:spa` + `npx cap sync android`), because the recipe previously
  relied on the committed bundle (`docs/FDROID.md`).
- **The full-history audit can be run on demand:** `security-scan.yml` now
  accepts `workflow_dispatch`, so a history finding can be confirmed or cleared
  without waiting for the Monday cron.
- **Credential-field copy is obviously synthetic:** the CloudConnectModal
  app-password field now reads "Paste your app password" instead of a
  token-shaped placeholder (guide II.29.1).

Still open from the design audit: on-hardware a11y spot-check (pending device
build). CI verification for the 4.0.0 polish slice is pending.

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
