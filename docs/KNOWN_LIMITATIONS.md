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

## 7. Audio import & recording limits

- **Accepted import size:** up to **50 MB** (`MAX_IMPORT_BYTES`). Larger files are rejected with a clear error.
- **Downsample limit:** files up to **40 MB** (`MAX_CONVERSION_BYTES`) are decoded and converted to 16 kHz mono PCM WAV. Larger accepted files keep their source format, so offline Whisper may not process them; the UI surfaces this explicitly instead of failing silently.
- **30-minute cap:** imports/recordings longer than 30 minutes (`MAX_RESAMPLE_SECONDS`) are transcoded only for their first 30 minutes. The app now reports this via a visible warning rather than dropping audio silently.
- **Metadata honesty:** `sample_rate`/`channels` are only recorded as `16000`/`1` when a genuine conversion happened. Unconverted audio keeps its real container extension (`.m4a`, `.mp3`, `.ogg`, `.webm`) and MIME type.

## 8. Android install & update (sideloading)

- **ABI**: the APK ships `arm64-v8a` only (`ndk.abiFilters`). 32-bit-only (`armeabi-v7a`) and x86 devices cannot install it. This keeps the APK small given the bundled Whisper runtime.
- **In-place updates require a stable signing key.** A newly downloaded APK can replace an installed copy only when it shares the same `applicationId`, the same signing certificate, and a `versionCode` ≥ the installed one. If the key changes, Android refuses the install ("App not installed") until the old app is uninstalled.
- **Bump the version before releasing.** `versionCode` is derived from `package.json` (`major*10000 + minor*100 + patch`); leaving the version unchanged still installs, but bumping is the reliable way to force an upgrade prompt.
- Debug and release builds are both signed with the configured key (when present) so a sideloaded debug build stays upgradable to a release build.
