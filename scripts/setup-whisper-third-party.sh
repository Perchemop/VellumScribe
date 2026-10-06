#!/usr/bin/env bash
# Fetch full upstream whisper.cpp + ggml into the Android native tree.
# Required for VELLUM_WHISPER_REAL / inferenceRuntimeReady on device builds.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/android/app/src/main/cpp/third_party"
mkdir -p "$TARGET"
cd "$TARGET"
if [[ -f whisper.cpp/src/whisper.cpp && -f whisper.cpp/ggml/src/ggml.c ]]; then
  echo "Already present: $TARGET/whisper.cpp"
  exit 0
fi
rm -rf whisper.cpp
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git whisper.cpp
test -f whisper.cpp/src/whisper.cpp
test -f whisper.cpp/include/whisper.h
test -f whisper.cpp/ggml/src/ggml.c
echo "UPSTREAM_OK: $TARGET/whisper.cpp"
