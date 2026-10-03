# stub/ — fail-closed Whisper shim

This is **not** ggml-org whisper.cpp.

It implements a minimal API compatible with `jni_whisper.cpp` and always reports
`whisper_has_tensor_runtime() == false` unless compiled with
`WHISPER_REAL_INFERENCE_READY` (which must **never** be set for this stub).

Real sources live in `../third_party/whisper.cpp` and are linked only when
CMake detects them and `VELLUM_WHISPER_REAL` is ON.
