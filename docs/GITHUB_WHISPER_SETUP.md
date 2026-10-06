# GitHub + offline Whisper setup

Dual-mode native build: `android/app/src/main/cpp/CMakeLists.txt`

- **REAL** when `src/whisper.cpp` and `ggml/src/ggml.c` exist (default)
- **STUB** when missing or `-DVELLUM_WHISPER_REAL=OFF`

## Sources on main

`main` vendors upstream via:

**Actions → Vendor Whisper upstream → Run workflow**

(`.github/workflows/vendor-whisper.yml`)

Or locally:

```bash
npm run setup:whisper
```

## Build APK

```bash
npm ci
npm run build:spa
npx cap sync android
cd android
./gradlew :app:assembleRelease
```

Expect:

```text
VellumScribe: REAL whisper.cpp + ggml build
```

For intentional stub CI builds:

```bash
./gradlew :app:assembleRelease -DVELLUM_WHISPER_REAL=OFF
```

Or use **Actions → Build Android APK** with input `whisper_mode=stub|real`.

## Device smoke test

1. Install arm64 APK
2. Settings → Offline AI → **Engine Ready**
3. Download tiny model
4. Airplane mode → record 5–10s → real transcript words
