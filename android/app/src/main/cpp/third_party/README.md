# Upstream Vendored Whisper.cpp

This directory houses the vendored upstream `whisper.cpp` + `ggml` repository for building the real on-device tensor inference runtime in VellumScribe v3.1.0+.

## How to Vendor for Real Production APK Builds

On your local workstation or CI/CD builder with NDK installed:

```bash
cd android/app/src/main/cpp/third_party
rm -rf whisper.cpp
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp
```

Ensure the following paths exist:
- `third_party/whisper.cpp/src/whisper.cpp`
- `third_party/whisper.cpp/include/whisper.h`
- `third_party/whisper.cpp/ggml/src/ggml.c`
- `third_party/whisper.cpp/ggml/include/ggml.h`

When these files are present, `CMakeLists.txt` automatically detects `_vellum_upstream_ok` and builds the real `libwhisper.so` with `WHISPER_REAL_INFERENCE_READY=1`.
