# Building & Vendoring Offline Whisper AI for Android

VellumScribe ships on-device speech transcription using an embedded C++ `whisper.cpp` engine accessed via JNI from the `OfflineAiPlugin` Capacitor bridge.

---

## Architecture Overview

```
[React Web App]
       │  (OfflineAi.startTranscription)
       ▼
[OfflineAiPlugin.java] (Capacitor Plugin)
       │  (Enqueues WorkManager job with foreground notification)
       ▼
[TranscriptionWorker.java] (Background Worker)
       │  - Bounded 20s audio segmentation
       │  - 30ms frame-based Voice Activity Detection (VAD)
       │  - Battery / Thermal / Memory aware thread governor
       │  - Durable chunk checkpointing to SQLite
       ▼
[WhisperEngine.java] (JNI Binding)
       │
       ▼
[libwhisper.so] (Native C++17 shared library)
       │
       ▼
[whisper.cpp / GGML Engine]
       │  (Direct memory-mapped quantized model evaluation)
       ▼
[ggml-tiny-q5_1.bin / ggml-base-q5_1.bin]
```

---

## 1. Prerequisites

1. **Android Studio** (Hedgehog 2023.1.1 or later)
2. **Android NDK** (Version `25.1.8937393` or newer recommended)
3. **CMake** (Version `3.22.1` installed via Android SDK Manager)
4. **Android SDK Platform 34+**

---

## 2. Directory Layout & Vendored Sources

Native code lives in `android/app/src/main/cpp/`:

```
android/app/src/main/cpp/
├── CMakeLists.txt              # Dual-mode build definition for libwhisper.so
├── jni_whisper.cpp             # JNI bridge between WhisperEngine.java and whisper.cpp
├── stub/                       # Fail-closed shim (used when upstream is absent or VELLUM_WHISPER_REAL=OFF)
│   ├── README.md
│   ├── whisper.cpp
│   └── whisper.h
└── third_party/                # Upstream vendored whisper.cpp + ggml tree
    ├── README.md
    └── whisper.cpp/
        ├── CMakeLists.txt
        ├── ggml/
        ├── include/
        └── src/
```

---

## 3. ABI Selection & Size Optimization

By default, VellumScribe builds for **`arm64-v8a`** as primary to minimize APK size while delivering maximum 64-bit ARM NEON SIMD tensor throughput.

In `android/app/build.gradle`:

```gradle
android {
    defaultConfig {
        ndk {
            abiFilters 'arm64-v8a'
        }
        externalNativeBuild {
            cmake {
                cppFlags "-std=c++17 -fPIC -O3"
                arguments "-DANDROID_STL=c++_shared"
            }
        }
    }
}
```

If 32-bit devices (`armeabi-v7a`) or x86_64 emulators are required, add them to `abiFilters`.

---

## 4. Building from Source

To compile the native library alongside the Android application:

```bash
cd android
./gradlew assembleRelease
# Or build an Android App Bundle (AAB):
./gradlew bundleRelease
```

Gradle automatically invokes CMake to compile `libwhisper.so` and packages it into `lib/arm64-v8a/libwhisper.so` inside the APK/AAB.

---

## 5. Model Management

Models are quantized with **Q5_1** GGML format for mobile efficiency:

| Model ID        | File Name             | Size    | Min RAM | Accuracy | Target Use Case                       |
| --------------- | --------------------- | ------- | ------- | -------- | ------------------------------------- |
| `whisper-tiny`  | `ggml-tiny-q5_1.bin`  | ~31 MB  | 1 GB    | Fast     | Quick voice memos & short dictation   |
| `whisper-base`  | `ggml-base-q5_1.bin`  | ~58 MB  | 2 GB    | Balanced | Default recommendation for meetings   |
| `whisper-small` | `ggml-small-q5_1.bin` | ~182 MB | 4 GB    | High     | Complex terminology & long interviews |

Models are stored in app-private storage: `/data/user/0/com.vellumscribe.app/files/models/whisper/`.
Downloads feature HTTP range resume, exponential backoff, and SHA-256 verification.
