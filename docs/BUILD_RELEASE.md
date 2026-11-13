# Android Production Release Guide

This document describes how to generate release keystores, configure Gradle signing, build production Android App Bundles (AAB) or APKs, and verify ProGuard optimization for VellumScribe.

---

## 1. Generating a Release Keystore

Run the standard Java `keytool` command to generate a production signing key:

```bash
keytool -genkey -v \
  -keystore vellumscribe-release.jks \
  -alias vellumscribe \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store `vellumscribe-release.jks` in a secure location outside version control.

---

## 2. Configuring Gradle Release Signing

`android/app/build.gradle` already wires signing. It reads, in order:

1. `android/keystore.properties` (local builds; git-ignored)
2. `VELLUM_KEYSTORE_PATH` / `VELLUM_STORE_PASSWORD` / `VELLUM_KEY_ALIAS` / `VELLUM_KEY_PASSWORD` environment variables (CI)

Create `android/keystore.properties` (a template lives at `android/keystore.properties.example`):

```properties
storeFile=/absolute/path/to/vellumscribe-release.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=vellumscribe
keyPassword=YOUR_KEY_PASSWORD
```

When a key is configured, **both `debug` and `release` builds are signed with it**. That is deliberate: a sideloaded debug APK must be replaceable by a later release APK on the same device, which only works when the certificate matches.

If no key is configured, the release APK is left _unsigned_ and Gradle logs a warning — such an APK cannot be installed at all, so never ship it.

### Why a stable key matters (in-place updates)

For a newly downloaded APK to upgrade an already-installed copy, Android requires **all** of:

| Requirement                                   | Where it is enforced       |
| --------------------------------------------- | -------------------------- |
| Same `applicationId` (`com.vellumscribe.app`) | `android/app/build.gradle` |
| Same signing certificate as the installed app | the keystore               |
| `versionCode` ≥ the installed app's           | `android/app/build.gradle` |
| Same `versionName` channel (informational)    | `package.json`             |

Never regenerate or rotate the release key once users have installed a build: doing so forces every user to uninstall first ("App not installed").

### Version numbers

`versionName` and `versionCode` are derived from the root `package.json`:

- `versionName` = `package.json#version` (override with `VELLUM_VERSION_NAME`)
- `versionCode` = `major*10000 + minor*100 + patch` (override with `VELLUM_VERSION_CODE`)

So `3.1.0` → `versionCode 30100`. Bumping `package.json` before a release is enough to make the new APK install over the previous one.

---

## 2b. Launcher Icons & Splash Screens

Native art is generated from the brand mark so it matches `public/favicon.svg`:

```bash
npm run assets:brand
```

This regenerates the adaptive-icon foreground, all density `mipmap-*/ic_launcher*.png`, and every splash drawable. Re-run it whenever the brand mark changes, and commit the output.

---

## 3. Building Release Artifacts

### Option A: Android App Bundle (AAB - Recommended for Google Play / Accrescent)

```bash
# 1. Build web application assets
npm run build

# 2. Sync web assets to Android
npx cap sync android

# 3. Build release AAB
cd android
./gradlew bundleRelease
```

The bundle is located at: `android/app/build/outputs/bundle/release/app-release.aab`.

**Generated assets are not committed.** Step 2 writes the web bundle and Capacitor plugin metadata into the Android project — `android/app/src/main/assets/public/`, `android/app/src/main/assets/capacitor.config.json` and `android/app/src/main/assets/capacitor.plugins.json`. These are build output from the web build + `cap sync`, so they are intentionally not tracked in git: a fresh clone must run steps 1 and 2 above before any `./gradlew` build, or Gradle packages an empty (or stale) web layer. `.github/workflows/build-apk.yml` runs both steps automatically.

### Option B: Release Universal / ABI APK (For GitHub Releases / F-Droid)

```bash
cd android
./gradlew assembleRelease
```

The signed APK is located at: `android/app/build/outputs/apk/release/app-release.apk`.

---

## 4. ProGuard & R8 Verification

ProGuard rules in `android/app/proguard-rules.pro` preserve critical Capacitor, SQLite, and Offline AI JNI bridges:

- `com.getcapacitor.**`
- `com.vellumscribe.app.offlineai.**`
- `com.vellumscribe.app.offlineai.whisper.WhisperEngine` (native methods)
- `com.vellumscribe.app.offlineai.workers.TranscriptionWorker`
- `com.capacitorjs.community.plugins.sqlite.**`

To test minification without signing errors, run:

```bash
./gradlew checkReleaseDuplicateClasses lintRelease
```

---

## 5. CI Signing (GitHub Actions)

`.github/workflows/build-apk.yml` signs automatically when these repository secrets are present:

| Secret                    | Value                                 |
| ------------------------- | ------------------------------------- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 vellumscribe-release.jks` |
| `ANDROID_STORE_PASSWORD`  | keystore password                     |
| `ANDROID_KEY_ALIAS`       | `vellumscribe`                        |
| `ANDROID_KEY_PASSWORD`    | key password                          |

The workflow decodes the keystore, writes `android/keystore.properties`, and builds `assembleDebug assembleRelease`. **Tagged releases (`v*`) fail the build when the keystore secret is missing**, so a release can never be published unsigned.

### Verifying an APK can update an install

```bash
# Fingerprint of the keystore you build with
keytool -list -v -keystore vellumscribe-release.jks -alias vellumscribe | grep SHA256

# Fingerprint the APK actually ships with
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk

# Confirm versionCode increased versus the installed release
aapt dump badging android/app/build/outputs/apk/release/app-release.apk | grep versionCode
```

The two SHA-256 fingerprints must match the copy already on the phone, and `versionCode` must be ≥ the installed one.

### Digital Asset Links

App Links / OAuth deep links depend on `public/.well-known/assetlinks.json`. Replace the placeholder with the release keystore's SHA-256 fingerprint (no colons):

```bash
keytool -list -v -keystore vellumscribe-release.jks -alias vellumscribe \
  | grep SHA256 | awk '{ print $2$3$4$5$6$7$8$9$10 }' | tr -d ':'
```

## 6. Release checklist (suite standards, guide §12.1)

Cutting a release is more than tagging: the tag run also updates the token
ledger and publishes the metrics section in the release notes.

1. **Bump the version in the same change as the ledger.** `package.json`,
   `src/lib/appUpdateManager.ts` (`CURRENT_APP_VERSION`) and
   `docs/tokens.json` (`release_version`) must agree — a test asserts the ledger
   matches the running version, so a version bump that forgets the ledger fails
   `verify`. Update it with:

   ```bash
   npx tsx scripts/tokens-ledger.ts --version <new-version> --tokens <tokens-this-release>
   ```

   `--tokens 0` is honest when the figure is not measured: the ledger and the
   release notes render `0` as "not measured", never as a measurement.

2. **Tag from `main`** (`v<x.y.z>`). `.github/workflows/release.yml` then:
   - appends the `### Token metrics` section (generated for this tag) to the
     release body and creates or updates the GitHub Release;
   - runs the `token-ledger` job, which records this tag's figure in
     `docs/tokens.json` and **opens a pull request** (a direct push to the
     protected `main` would be rejected). Merge that PR like any other.
3. **Dry run without releasing** (verifies the ledger CLI and the JSON in CI):

   ```bash
   gh workflow run "Release (tag)" -f release_tokens=0 -f tag=<x.y.z>
   ```

   A manual run writes nothing, opens no PR, and never touches a release.

4. **Confirm the release assets**: signed APK variants plus
   `APK-SHA256SUMS.txt`, and the token-metrics section in the notes.

See `docs/suite-standards.md` for how this repository maps each guide §12.1
suite standard (and where it deliberately deviates — there is no in-app
self-update).
