# GitHub + offline Whisper setup

The app wires STUB vs REAL native builds in `android/app/src/main/cpp/CMakeLists.txt`.

## Full upstream sources (required for REAL builds)

The GitHub tree may not vendor the entire `ggml-org/whisper.cpp` source set (it is large).
On any machine that builds the Android APK:

```bash
npm run setup:whisper
# equivalent:
bash scripts/setup-whisper-third-party.sh
```

This clones https://github.com/ggml-org/whisper.cpp into:

`android/app/src/main/cpp/third_party/whisper.cpp`

CMake enables REAL mode when both exist:

- `third_party/whisper.cpp/src/whisper.cpp`
- `third_party/whisper.cpp/ggml/src/ggml.c`

Then:

```bash
npm run build:spa
npx cap sync android
cd android && ./gradlew :app:assembleRelease
```

Expect log line: `VellumScribe: REAL whisper.cpp + ggml build`

The complete tree is also in the `vellumscribe-v3.1.0-source.zip` release package.
