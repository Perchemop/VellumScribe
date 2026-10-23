# Android End-to-End Release Audit

Date: 2026-10-16 · Target: VellumScribe `3.1.0` (`com.vellumscribe.app`)

This document records a full pass over the Android release path: toolchain,
build/signing, branding assets, bundle performance, and what still has to be
verified on a machine that can actually assemble the APK.

---

## 1. System tool audit

An APK cannot be assembled in the current workspace: there is **no JDK, no
Android SDK/NDK, and no CMake**, and the box has ~2.7 GiB RAM total. Gradle +
AGP + the native whisper/ggml build would OOM before finishing. Release
artifacts must be produced by CI or a workstation.

| Tool                       | Workspace      | Required for                | Notes                                    |
| -------------------------- | -------------- | --------------------------- | ---------------------------------------- |
| Node 22.23.3               | ✅             | web bundle, tests           | matches CI `node 22`                     |
| npm 10.9.9                 | ✅             | dependency install          | CI uses `npm install --legacy-peer-deps` |
| Python 3.13.5              | ✅             | asset/CI helper scripts     |                                          |
| git / gh                   | ✅ (gh authed) | commits, releases           |                                          |
| JDK 21                     | ❌             | Gradle / AGP                | CI: `temurin 21`                         |
| Android SDK platform 36    | ❌             | `compileSdk`/`targetSdk` 36 | see fix in §2                            |
| Android build-tools 36.0.0 | ❌             | packaging                   |                                          |
| NDK 26.1.10909125          | ❌             | whisper JNI                 | now pinned in Gradle                     |
| CMake 3.22.1 + ninja       | ❌             | `externalNativeBuild`       |                                          |
| `aapt2`/`apksigner`/`adb`  | ❌             | install & verification      |                                          |

`android/local.properties` (the SDK path) is intentionally absent and
git-ignored; Gradle finds the SDK via `ANDROID_HOME`/`sdk.dir`.

---

## 2. Build, versioning & in-place updates

The single most important requirement — _"a newly downloaded APK can update the
copy already installed on the phone"_ — needs three things to line up. Two were
missing.

| Requirement              | Before                                           | After                                                                                              |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `applicationId` stable   | ✅ `com.vellumscribe.app`                        | ✅                                                                                                 |
| Signed with a stable key | ❌ release was **unsigned**; no `signingConfigs` | ✅ reads `android/keystore.properties` or `VELLUM_*` env vars; **debug and release share the key** |
| `versionCode` increasing | ⚠️ hard-coded `31`                               | ✅ derived from `package.json` (`3.1.0` → `30100`), overridable                                    |
| `versionName`            | ⚠️ hard-coded `3.1.0`                            | ✅ from `package.json`                                                                             |

Fixes shipped:

- `android/app/build.gradle` — added `signingConfigs.release`, wired the same
  config into `debug` and `release`, derived `versionCode`/`versionName` from
  `package.json`, pinned `ndkVersion`, and a Gradle task that logs the
  version/signed state and warns on an unsigned release.
- `android/keystore.properties.example` — documented signing template;
  `android/keystore.properties` and `*.jks`/`*.keystore` are git-ignored.
- `.github/workflows/build-apk.yml` — decodes a keystore from repository
  secrets and writes `keystore.properties` before building, and **fails tagged
  (`v*`) releases when no keystore is configured**.
- Fixed an SDK mismatch: CI installed `platforms;android-34` /
  `build-tools;34.0.0` while Gradle compiles against **36**; CI now installs
  `android-36` + `build-tools;36.0.0` and the NDK is pinned to match.

See `docs/BUILD_RELEASE.md` for the keystore generation, secrets, and
signature-verification commands.

> ABI: the app ships `arm64-v8a` only (`abiFilters`), so it installs on modern
> ARM64 phones. 32-bit-only devices are out of scope by design.

---

## 3. Icons & branding consistency

**Before:** the web app used the brand mark (`public/favicon.svg`) while Android
shipped the stock template art — the default Capacitor "Android robot"
adaptive-icon foreground with a **white** background layer, plus the default
teal grid drawable.

**After:** all native art is generated from the same mark.

- Added `scripts/generate-brand-assets.mjs` (`npm run assets:brand`) — a
  dependency-free rasteriser that reproduces the favicon geometry (V arms, stem,
  dot) with 4× supersampling and writes PNGs via `zlib`.
- Regenerated: `mipmap-*/ic_launcher.png` (rounded), `ic_launcher_round.png`
  (circle), `ic_launcher_foreground.png` (transparent, adaptive), and every
  `drawable-*/splash.png` (portrait + landscape, all densities).
- `values/ic_launcher_background.xml` is now `#09090B` (was `#FFFFFF`) to match
  the favicon; the adaptive icon now also declares `<monochrome>` for Android 13
  themed icons.
- Deleted the unused template vectors
  `drawable-v24/ic_launcher_foreground.xml` and
  `drawable/ic_launcher_background.xml`.

Palette in use: icon background `#09090B` (favicon-identical), splash/WebView
background `#121215`, mark `#FFFFFF`.

All 26 PNGs and 11 resource XML files were validated (CRC + zlib inflate +
XML well-formedness) — 0 corrupt, 0 malformed.

---

## 4. Performance

Web bundle measured with `vite build --manifest` (entry + statically reachable
chunks, i.e. what loads before the first paint):

| Metric   | Before    | After                                       |
| -------- | --------- | ------------------------------------------- |
| Eager JS | 893.12 kB | **867.76 kB** (−25.4 kB raw, ~−6.8 kB gzip) |

Cause: `NoteShareModal` and `TranscriptionRecoverySheet` were lazily imported in
`NoteEditorWriteFirst` but **statically** imported by `EventNotesList` and
`AudioPlayerWidget`, so Rollup inlined them into the entry bundle (vite emitted
`INEFFECTIVE_DYNAMIC_IMPORT`). Both static sites now use `React.lazy` +
`Suspense`, so those modals load on demand.

Android-side performance settings already in place and verified:

- `release`: `minifyEnabled true` + `shrinkResources true` (R8).
- `abiFilters 'arm64-v8a'` only (smaller APK; no 32-bit or x86 payloads).
- Web code-splitting: heavy modals (`SettingsModal`, `OcrScannerModal`,
  `AiStudioKeyModal`, `AudioRecordingModal`, …) already lazy.
- `android:enableOnBackInvokedCallback="true"` for predictive back.
- Native splash via `Theme.SplashScreen` with the brand splash drawable.

---

## 4b. CI hygiene findings (recommendation only — not changed)

`.github/workflows/` previously contained 19 permanent no-op stubs
(`if: false` jobs named "(disabled)") plus four `push`-triggered bots
(`fix-ai-handlers.yml`, `fix-settings-jsx.yml`, `remove-orphans.yml`,
`ux-residual.yml`) holding `contents: write` and auto-committing to `main`.

**Status: resolved 2026-10-21 (Q-008).** The 19 stubs were deleted and the
four bots were converted to `workflow_dispatch` only, so no workflow now
fires on `push` except `build-apk.yml`, `ci.yml` and `security-scan.yml`.
`vendor-whisper.yml` was left untouched (dispatch-only, legitimate
vendor-fetch tool). `.github/workflows/` is now 8 files. See
`DECISIONS.md` D-304.

## 4c. Actions runs were failing before any step starts ✅ RESOLVED

_Status: resolved 2026-10-21._

Originally, every run on `main` failed in 2–4 s with `steps: []` and no logs
(`BlobNotFound`):

```
completed  failure  Security Scanning  main  push  38830247074  3s
completed  failure  Build Android APK  main  push  38830247073  3s
completed  failure  CI                 main  push  38830247036  2s
```

Jobs dying with zero steps never reached checkout, so this was not a code
problem — it was the account/repo runner side (Actions spending limit /
billing on a private repository). The repository is now public and runs
execute normally:

```
39566612176  CI                 success  verify (ubuntu / windows / macos)
39566612217  Security Scanning  success  Dependency Audit + CodeQL
39566612127  Build Android APK  success  artifact VellumScribe-Android-APKs-real
```

The Android build logged `versionName=3.1.0 versionCode=30100 signed=false`
for both `assembleDebug` and `assembleRelease`, plus an explicit warning that
the release APK is unsigned until a keystore is configured.

One real bug was also fixed here: `build-apk.yml` used the `secrets` context
inside `if:`, which is not allowed and made GitHub treat the workflow as
invalid (it was listed by file path instead of by name). The presence checks
now happen in the shell.

One real bug was also fixed here: `build-apk.yml` used the `secrets` context
inside `if:`, which is not allowed and made GitHub treat the workflow as
invalid (it was listed by file path instead of by name). The presence checks
now happen in the shell.

---

## 5. Not verifiable in this workspace

1. **`./gradlew assembleDebug assembleRelease`** — no JDK/SDK/NDK/CMake/RAM.
2. **APK install/upgrade on a device** — needs hardware.
3. **Signature continuity** — needs the actual release keystore.
4. **R8/minify runtime behaviour** — needs a built, signed APK.

How to close these out (on CI or a workstation with the toolchain):

```bash
npm ci --legacy-peer-deps
npm run assets:brand        # only if the brand mark changed
npm run build:spa
npx cap sync android
cd android && ./gradlew assembleDebug assembleRelease

# install over an existing copy (must NOT report a signature mismatch)
adb install -r app/build/outputs/apk/release/app-release.apk
# confirm the coordinates the OS sees
aapt2 dump badging app/build/outputs/apk/release/app-release.apk | head
```

The `assemble*` tasks print
`VELLUM: assembleRelease -> versionName=… versionCode=… signed=…`; `signed=true`
and a strictly increasing `versionCode` are the two things to confirm before
publishing.
