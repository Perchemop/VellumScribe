# VellumScribe Release 3.1.0

**Release Date:** 2026-10-03  
**Target Platform:** Web (Vite + Node/Express) & Android (Capacitor + NDK C++17)  
**Version:** 3.1.0 (buildCode: 31)

---

## Highlights

1. **Real Native Whisper.cpp & GGML Engine Path**:
   - Integrated full upstream `whisper.cpp` and `ggml` source tree in `android/app/src/main/cpp/third_party/whisper.cpp/`.
   - Updated `CMakeLists.txt` with automatic detection (`_vellum_upstream_ok`), compiling real NEON/SIMD tensor evaluation when vendored sources exist.
   - Preserved fail-closed stub fallback in `android/app/src/main/cpp/stub/` for zero-overhead CI/stub configurations.

2. **Dual-Mode JNI Architecture (`jni_whisper.cpp`)**:
   - Conditioned on `WHISPER_REAL_INFERENCE_READY=1`.
   - Real mode: `whisper_init_from_file_with_params()`, `whisper_full_default_params(WHISPER_SAMPLING_GREEDY)` with thread count and language detection, segment-by-segment transcript assembly, and `nativeHasTensorRuntime() -> JNI_TRUE`.
   - Stub mode: Cleanly returns `OFFLINE_AI_ENGINE_UNAVAILABLE` (-2) and `nativeHasTensorRuntime() -> JNI_FALSE`.

3. **Version Alignment Across All Layers**:
   - `package.json`: 3.1.0
   - `src/lib/appUpdateManager.ts`: `CURRENT_APP_VERSION = '3.1.0'`, `CURRENT_BUILD_NUMBER = 31000`
   - `android/app/build.gradle`: `versionCode 31`, `versionName "3.1.0"`

---

## Building the Release APK

### Prerequisites
- Node.js 20+
- Android Studio / Android SDK (Platform 34+)
- Android NDK (r25+ recommended, e.g. `25.1.8937393`)
- CMake 3.22.1+

### Build Steps
```bash
# 1. Compile web application
npm ci
npm run build:spa

# 2. Sync web assets with Capacitor Android wrapper
npx cap sync android

# 3. Assemble Release APK
cd android
./gradlew :app:assembleRelease
```

### Rollback / Stub Mode
To force the fail-closed stub build without tensor execution runtime:
```gradle
// In android/app/build.gradle
defaultConfig {
    externalNativeBuild {
        cmake {
            arguments "-DVELLUM_WHISPER_REAL=OFF"
        }
    }
}
```

---

## Device Smoke Test Matrix

1. **Clean Installation**: Install ARM64 release APK on an Android 13/14 device.
2. **Inference Runtime Check**: Navigate to Settings → Offline AI; `inferenceRuntimeReady` reports `true` on real build.
3. **Model Download**: Download `ggml-tiny-q5_1.bin`.
4. **Offline Voice Memo**: Record a short audio memo without network connectivity; transcription outputs genuine English words.
