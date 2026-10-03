# third_party/whisper.cpp

Vendored upstream from https://github.com/ggml-org/whisper.cpp

## Install (required for real offline Whisper)

```bash
cd android/app/src/main/cpp/third_party
rm -rf whisper.cpp
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp
test -f whisper.cpp/src/whisper.cpp && test -f whisper.cpp/ggml/src/ggml.c && echo OK
```

Do **not** commit multi-hundred-MB model `.bin` files here.

Having these sources alone does not enable inference until CMake links them
(automatic when both files above exist) and you build with the Android NDK.
