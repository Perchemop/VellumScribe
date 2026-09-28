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

Create or update `android/keystore.properties` (ensure this file is in `.gitignore`):

```properties
storeFile=/path/to/vellumscribe-release.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=vellumscribe
keyPassword=YOUR_KEY_PASSWORD
```

In `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            if (file('../keystore.properties').exists()) {
                def props = new Properties()
                props.load(new FileInputStream(file('../keystore.properties')))
                storeFile file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

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
