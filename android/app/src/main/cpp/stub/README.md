# VellumScribe Offline AI Stub Engine

This directory contains the fail-closed fallback implementation of the Whisper C API for VellumScribe.

When the real upstream `third_party/whisper.cpp` is not present or when `VELLUM_WHISPER_REAL=OFF` is set in CMake, this stub compiles into `libwhisper.so`.

## Behavior
- `whisper_has_tensor_runtime()` returns `false` (`0`).
- `whisper_init_from_file()` returns `nullptr`.
- `whisper_full()` returns `-2`, signaling `OFFLINE_AI_ENGINE_UNAVAILABLE`.
- The Android UI and `TranscriptionOrchestrator` cleanly recognize this state (`inferenceRuntimeReady=false`) and guide the user to Live Dictation (OS SpeechRecognizer) or Cloud AI transcription via `TranscriptionRecoverySheet`.
