# Offline AI & Whisper Build Architecture

> **CRITICAL ARCHITECTURE NOTICE: The current shipped binary includes the native stub implementation until ggml is vendored.**
> Full on-device Whisper inference is gated and will not produce transcripts until `third_party/whisper.cpp` + `ggml` are compiled into the native Android library.

This document describes the on-device Speech-to-Text (STT) architecture in VellumScribe, detailing the current stub implementation, capability gating, and the integration path to full native GGML tensor inference.

---

## 1. Current Status (Archive 45 / v3.0.0)

> **Current binary ships the stub implementation until ggml is vendored.**

- **Native Whisper Library:** `libwhisper.so` is compiled with the fail-closed C/C++ stub until upstream `ggml` is vendored.
- **Inference Runtime Check:** `OfflineAiManager.getDeviceCapabilities().inferenceRuntimeReady` safely evaluates to `false` because `WHISPER_REAL_INFERENCE_READY` is unset.
- **Honesty Gating:**
  - **Onboarding:** Clearly directs users toward **Live Dictation** while recording or optional **Cloud Gemini AI**.
  - **Model Downloads:** Disabled in Offline AI Settings to prevent unnecessary downloads until GGML inference is compiled.
  - **Transcripts:** `TranscriptionOrchestrator` strictly enforces engine transparency and rejects placeholder text.
  - **Recovery Pattern:** `TranscriptionRecoverySheet` provides immediate one-click fallback (Cloud AI, Live Dictation) when offline Whisper is requested.

---

## 2. Working Speech-to-Text & SSO Paths Today (Archive 45)

1. **Native OS SpeechRecognizer in Recording Path (Android & Web):**
   - `AudioRecordingManager` automatically detects `android.speech.SpeechRecognizer` via the `OfflineAi` plugin or Web Speech API.
   - Speech is transcribed live in real time into the note while audio records, requiring zero model weight downloads.
   - Transcripts indicate provenance via distinct engine badges (`Android SpeechRecognizer` or `Browser Acoustic Dictation`).
2. **Cloud Gemini Multimodal STT:**
   - Supported when network access is allowed via Privacy Mode and a Google AI Studio API key is provided.
   - Provides automated punctuation, timestamps, and speaker identification.
3. **Android SSO Deep-Link Plumbing (Archive 45):**
   - Native Capacitor Browser + App Links and custom scheme filters (`com.vellumscribe.app://oauth` and `vellumscribe://oauth`) in `AndroidManifest.xml`.
   - Full PKCE `code_verifier` round-trip and AES-256-GCM encrypted persistence across server restarts.

---

## 3. Integration Path for Real Native Whisper (T-P0.1)

To compile the real tensor inference runtime into Android APK builds:

### Step 1: Vendor Upstream whisper.cpp and ggml
1. Vendor upstream [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) into `android/app/src/main/cpp/third_party/whisper.cpp`.
2. Include the entire `ggml` backend (including `ggml.c`, `ggml-alloc.c`, `ggml-backend.c`, `ggml-quants.c`, and CPU/NEON kernel implementations).

### Step 2: Update CMakeLists.txt
1. Update `android/app/src/main/cpp/CMakeLists.txt` to compile upstream sources instead of the fallback stub.
2. Link `ggml` and platform log libraries:
   ```cmake
   add_library(whisper SHARED
       ${WHISPER_CPP_DIR}/whisper.cpp
       ${GGML_DIR}/src/ggml.c
       ${GGML_DIR}/src/ggml-alloc.c
       ${GGML_DIR}/src/ggml-backend.c
       ${GGML_DIR}/src/ggml-quants.c
       jni_whisper.cpp
   )
   ```
3. Define the compiler preprocessor flag:
   ```cmake
   target_compile_definitions(whisper PRIVATE WHISPER_REAL_INFERENCE_READY=1)
   ```

### Step 3: Adapt JNI Bridge (`jni_whisper.cpp`)
1. Ensure the JNI functions map cleanly to the updated C API in upstream `whisper.h`:
   - `whisper_init_from_file_with_params(...)`
   - `whisper_full_default_params(...)`
   - `whisper_full(...)`
   - `whisper_full_n_segments(...)`
   - `whisper_full_get_segment_text(...)`

### Step 4: Verification & Smoke Test (T-P0.4)
1. Build `arm64-v8a` APK via Android NDK.
2. Download official quantized model (e.g. `ggml-tiny.bin` or `ggml-base.bin`, Q5_1).
3. Validate runtime probe returns `inferenceRuntimeReady: true`.
4. Perform an end-to-end spoken audio fixture test verifying acoustic speech converts to text on-device without network.
