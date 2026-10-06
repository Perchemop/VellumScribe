# VellumScribe — Known Limitations

This document tracks known constraints, trade-offs, and platform boundaries as of **v3.1.0**.

---

## 1. Native Tensor Runtime & NDK Compilation

- **NDK Requirement:** Compiling the real `whisper.cpp` + `ggml` on-device inference library (`libwhisper.so`) requires the Android NDK (r25+) and the complete vendored `third_party/whisper.cpp` source tree (`src/whisper.cpp` + `ggml/src/ggml.c`).
- **GitHub main:** Upstream sources are vendored on `main` via the **Vendor Whisper upstream** workflow (`.github/workflows/vendor-whisper.yml`). Re-run that workflow after rebasing if the tree is missing.
- **Stub Fallback:** If sources are missing or `-DVELLUM_WHISPER_REAL=OFF` is set, `libwhisper.so` compiles in fail-closed stub mode (`inferenceRuntimeReady=false`). UI disables model download and routes users to OS live dictation or Cloud AI.
- **CI default:** APK workflow builds **stub** by default for speed. Choose **real** in `workflow_dispatch` inputs for a full tensor build (slow).

## 2. Model Downloads

- **Runtime Fetch:** Model weights (`ggml-tiny-q5_1.bin`, `ggml-base-q5_1.bin`) are not bundled into the base APK. Download them in **Settings → Offline AI** after a REAL APK reports Engine Ready.
- **Storage:** Quantized models need roughly 31 MB (tiny) to 142 MB (base) of internal storage.

## 3. Android SpeechRecognizer & Language Packs

- Some OEM ROMs require offline language packs for `android.speech.SpeechRecognizer`. Without packs, offline mode can surface `ERROR_NETWORK` even when the app intends offline-only operation.
- Install offline speech language data in the device system settings when relying on OS live dictation.

## 4. SSO Deep Links & App Link Verification

- Custom schemes `com.vellumscribe.app://oauth` and `vellumscribe://oauth` work without Digital Asset Links.
- HTTPS App Links (`https://vellumscribe.app/...`) need a published `assetlinks.json` matching the **production** signing certificate SHA-256 to skip the disambiguation dialog.

## 5. UI Architecture

- `SettingsView.tsx` remains a large orchestration surface. Sub-panels (`SecurityPanel`, `StoragePanel`, `OfflineAiPanel`, `AboutPanel`) already extract major sections; further splits are incremental polish, not blockers.

## 6. Offline Whisper packaging

CMake, JNI, and the fail-closed `stub/` ship in-repo.

REAL inference requires:

- `android/app/src/main/cpp/third_party/whisper.cpp/src/whisper.cpp`
- `android/app/src/main/cpp/third_party/whisper.cpp/include/whisper.h`
- `android/app/src/main/cpp/third_party/whisper.cpp/ggml/src/ggml.c`

Refresh with:

```bash
npm run setup:whisper
# or GitHub Actions → Vendor Whisper upstream → Run workflow
```

Then NDK-build a **real** APK and smoke-test offline transcription on device.
