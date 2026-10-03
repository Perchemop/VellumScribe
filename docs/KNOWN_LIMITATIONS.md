# VellumScribe — Known Limitations

This document tracks known constraints, trade-offs, and platform boundaries as of **v3.1.0**.

---

## 1. Native Tensor Runtime & NDK Compilation
- **NDK Requirement:** Compiling the real `whisper.cpp` + `ggml` on-device inference library (`libwhisper.so`) requires the Android NDK (r25+) and the complete vendored `third_party/whisper.cpp` source tree.
- **Stub Fallback:** If `third_party/whisper.cpp` is missing or `-DVELLUM_WHISPER_REAL=OFF` is specified, `libwhisper.so` compiles in fail-closed stub mode (`inferenceRuntimeReady=false`), cleanly directing users to OS Live Dictation or Cloud AI.

## 2. Model Downloads
- **Runtime Fetch:** Model weights (`ggml-tiny-q5_1.bin`, `ggml-base-q5_1.bin`) are not bundled into the base APK to keep download sizes under 40 MB. They must be downloaded on first use in Settings → Offline AI.
- **Storage Consumption:** Quantized models require between 31 MB (tiny) and 142 MB (base) of device internal storage.

## 3. Android SpeechRecognizer & Language Packs
- On some Android OEM ROMs (e.g. older Android versions or devices without offline Google Speech Services installed), `android.speech.SpeechRecognizer` may attempt to reach network language packs if offline language data has not been pre-downloaded in device OS settings.
- If network access is gated by `PrivacyManager` in Offline Mode and offline packs are missing, the OS speech recognizer returns `ERROR_NETWORK`.

## 4. SSO Deep Links & App Link Verification
- Custom URI schemes (`com.vellumscribe.app://oauth` and `vellumscribe://oauth`) execute reliably on local devices.
- HTTPS App Links (`https://vellumscribe.app/oauth`) require a published `assetlinks.json` matching the production SHA-256 signing fingerprint to bypass the Android disambiguation dialog.

## 5. UI Architecture
- `SettingsView.tsx` remains a consolidated orchestration view managing privacy, encryption, backup accounts, and AI configurations. Modular sub-panels (`SecurityPanel`, `StoragePanel`, `OfflineAiPanel`) help maintain maintainability.

## 6. Offline Whisper packaging

CMake, JNI, and the fail-closed stub ship in the app repo.
`third_party/whisper.cpp` must include **src/**, **include/**, and **ggml/**
(especially `ggml/src/ggml.c`) or the build stays on the stub and
`inferenceRuntimeReady` remains false.
Clone https://github.com/ggml-org/whisper.cpp into that path before release builds
that advertise offline Whisper.


