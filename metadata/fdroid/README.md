# F-Droid metadata and submission guide

This directory contains the metadata and guidance for publishing VellumScribe to
F-Droid or similar alternative app stores. F-Droid builds apps from source on
its own build servers; the metadata file is submitted to the
[fdroiddata](https://gitlab.com/fdroid/fdroiddata) repository as a merge request.

## Files

- `metadata/fdroid/metadata.yml` — F-Droid app metadata (submit to fdroiddata as
  `metadata/com.vellumscribe.app.yml`).
- `metadata/fdroid/feature-graphic.svg` — store banner source (1024×500).
  Rasterise to PNG before submitting; stores accept PNG/JPEG only for banners.
- `docs/FDROID.md` — the full submission guide and compliance notes.

## One-time setup (before the first signed release)

1. Generate a release keystore and back it up — see `docs/RELEASE_KEYSTORE.md`.
2. Set the four CI secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Submission steps

1. Fork <https://gitlab.com/fdroid/fdroiddata>.
2. Copy `metadata/fdroid/metadata.yml` into your fork as
   `metadata/com.vellumscribe.app.yml`.
3. Export the app icon from `android/app/src/main/res/mipmap-*/` as `Icon.png`,
   and rasterise `feature-graphic.svg` to a 1024×500 PNG.
4. Open a merge request against fdroiddata.
5. F-Droid build servers compile from source and publish.

## F-Droid compliance notes

- All dependencies are FOSS (MIT, ISC, Apache-2.0, BSD) — see `ATTRIBUTION.md`.
- No Firebase, Google Play Services, AdMob, or proprietary blobs.
- No `google-services.json` in the repository.
- All cloud/AI features are opt-in and off by default.
- No tracking; optional usage metrics are disabled by default.
- Release builds use ProGuard/R8 minification and `shrinkResources`.
- ABI filter: `arm64-v8a` only (keeps the APK small).

See `docs/FDROID.md` for the CI release workflow details.
