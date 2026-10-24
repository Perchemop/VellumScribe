# F-Droid Release Notes for VellumScribe

#

# This directory contains the metadata and guidance for publishing VellumScribe

# to F-Droid or similar alternative app stores. F-Droid builds apps from source

# on its own build servers; this metadata file is submitted to the fdroiddata

# repository (https://gitlab.com/fdroid/fdroiddata) as a merge request.

#

# Files:

# metadata/fdroid/metadata.yml - F-Droid app metadata (submit to fdroiddata)

# docs/FDROID.md - This guide

#

# Prerequisites (must be completed before the first signed release):

# 1. Generate a release keystore (Q-002 tracks this):

# keytool -genkeypair -v -keystore vellumscribe-release.jks \

# -alias vellumscribe -keyalg RSA -keysize 2048 -validity 10000

# 2. Store the keystore safely and back it up — losing this key means you can

# never publish an update that replaces an installed copy.

# 3. Configure CI secrets:

# ANDROID_KEYSTORE_BASE64 (base64-encoded .jks)

# ANDROID_STORE_PASSWORD

# ANDROID_KEY_ALIAS

# ANDROID_KEY_PASSWORD

#

# Submission steps:

# 1. Fork https://gitlab.com/fdroid/fdroiddata

# 2. Copy metadata/fdroid/metadata.yml into your fork under

# metadata/com.vellumscribe.app.yml

# 3. Add the app icon (Icon.png) from android/app/src/main/res/mipmap-*/

# 4. Open a merge request against fdroiddata

# 5. F-Droid build servers will compile from source and publish

#

# F-Droid compliance notes:

# - All dependencies are FOSS (MIT, ISC, Apache-2.0, BSD) — see ATTRIBUTION.md

# - No Firebase, Google Play Services, AdMob, or proprietary blobs

# - No google-services.json in the repository

# - All cloud/AI features are opt-in and off by default

# - No tracking; optional usage metrics are disabled by default

# - Release builds use ProGuard/R8 minification and shrinkResources

# - ABI filter: arm64-v8a only (keeps APK small)

#

# See docs/BUILD_RELEASE.md for the CI release workflow details.
