# F-Droid Release Guide

VellumScribe is structured to be publishable on F-Droid or similar alternative
app stores. This document covers what is needed, what is already in place, and
what remains blocked on maintainer decisions.

## What F-Droid requires

F-Droid builds apps from source on its own build servers. To publish:

1. **100% FOSS code and dependencies** — no proprietary blobs, no Firebase,
   no Google Play Services, no AdMob.
2. **Stable signing key** — the same certificate must be used for every update
   so Android allows in-place replacement.
3. **F-Droid metadata** (`metadata.yml`) submitted to the fdroiddata repo.
4. **Reproducible builds** — ProGuard/R8 minification, pinned toolchain.

## What is already in place

| Requirement                 | Status | File                                                    |
| --------------------------- | ------ | ------------------------------------------------------- |
| FOSS dependencies           | ✅     | `ATTRIBUTION.md`, all deps MIT/ISC/Apache-2.0/BSD       |
| No Firebase / Play Services | ✅     | No `google-services.json`, no Firebase deps             |
| ProGuard / R8 minification  | ✅     | `android/app/build.gradle` (`minifyEnabled true`)       |
| shrinkResources             | ✅     | `android/app/build.gradle` (`shrinkResources true`)     |
| Pinned NDK / build-tools    | ✅     | `build-apk.yml` (NDK 26.1.10909125, build-tools 36.0.0) |
| ABI filter (arm64-v8a)      | ✅     | `android/app/build.gradle`                              |
| Version monotonicity        | ✅     | `versionCode` derived from `package.json`               |
| Signed release pipeline     | ⚠      | `build-apk.yml` supports signing from CI secrets        |
| F-Droid metadata            | ✅     | `metadata/fdroid/metadata.yml`                          |
| F-Droid submission guide    | ✅     | This file                                               |

## What remains blocked

### Q-002 — Release keystore

The release APK can only replace an already-installed copy if it is signed
with a **stable, consistent keystore**. No keystore exists yet. Until one is
generated and its secrets are added to the repository (or CI), `assembleRelease`
produces an **unsigned** APK.

To unblock:

```bash
# Generate the keystore (do this on a secure, backed-up machine)
keytool -genkeypair -v -keystore vellumscribe-release.jks \
  -alias vellumscribe -keyalg RSA -keysize 2048 -validity 10000

# Back up vellumscribe-release.jks somewhere safe — losing it means
# you can never publish an update again.

# Fill in android/keystore.properties.example → android/keystore.properties
# (never commit the real file or the .jks)

# Add CI secrets:
#   ANDROID_KEYSTORE_BASE64   (base64 of the .jks)
#   ANDROID_STORE_PASSWORD
#   ANDROID_KEY_ALIAS         (e.g. vellumscribe)
#   ANDROID_KEY_PASSWORD
```

Once the keystore exists, pushing a `v*.*.*` tag triggers `build-apk.yml` to
build, sign, and attach the APKs to a GitHub Release.

### F-Droid submission

F-Droid does not accept direct APK uploads. The process is:

1. Fork https://gitlab.com/fdroid/fdroiddata
2. Copy `metadata/fdroid/metadata.yml` into your fork as
   `metadata/com.vellumscribe.app.yml`
3. Export the app icon from
   `android/app/src/main/res/mipmap-*/` as `Icon.png`
4. Open a merge request against fdroiddata
5. F-Droid build servers compile from source and publish

The metadata file references commit `b0a0f7e` — update `currentVersion`,
`currentVersionCode`, and `commit` on each release.

## Release workflow

Pushing a tag `v*.*.*` triggers:

1. `.github/workflows/build-apk.yml` — builds debug + release APKs, signs the
   release APK if signing secrets are configured, attaches both to a GitHub
   Release with `APK-SHA256SUMS.txt`.
2. `.github/workflows/release.yml` — publishes the Release body from the
   matching `CHANGELOG.md` section.

Either workflow can create the Release; the other updates it.

## Anti-features

VellumScribe declares **no anti-features**:

- No ads
- No tracking (usage metrics are opt-in and off by default)
- No non-free network dependencies required (all cloud/AI features are
  opt-in and disabled by default)
- The app works fully offline

If F-Droid reviewers consider the optional Google AI SDK
(`@google/genai`) a non-free network dependency, add
`antiFeatures: NonFreeNet` to `metadata/fdroid/metadata.yml`.
