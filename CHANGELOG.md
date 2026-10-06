# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

This file is the canonical, accurate history. The older `docs/history/RELEASE_NOTES_*.md`
files are kept for the record but contain corrected notices at the top
where they previously described behavior that didn't match the shipped
code - see `docs/history/AUDIT.md` for the full story of how that happened.

## [3.1.0] - 2026-10-03

Real native Whisper build path (upstream whisper.cpp + ggml), dual-mode JNI bridge, and version alignment across Web and Android.

### Added

- **Real Native Whisper Build Path:** Integrated upstream `whisper.cpp` and `ggml` source tree in `android/app/src/main/cpp/third_party/whisper.cpp/` with automatic detection in `CMakeLists.txt` for real NEON/SIMD on-device inference compilation.
- **Dual-Mode JNI Architecture:** Updated `jni_whisper.cpp` with `WHISPER_REAL_INFERENCE_READY` compile flag, providing full greedy sampling, segment text extraction, and real runtime checks when upstream sources are present, with fail-closed stub fallback.
- **Fail-Closed Stub Isolation:** Moved legacy stub headers and shims into dedicated `android/app/src/main/cpp/stub/` directory, eliminating root-level file ambiguity.
- **Vendor Whisper workflow:** `.github/workflows/vendor-whisper.yml` clones full upstream and commits it to `main` (mobile-friendly).
- **APK workflow STUB/REAL input:** Build Android APK accepts `whisper_mode=stub|real`.
- **Priority status doc:** `docs/PRIORITY_STATUS_3.1.0.md`.

### Changed

- **Version Unified to 3.1.0:** Synchronized version across `package.json`, `android/app/build.gradle` (versionCode 31), and `src/lib/appUpdateManager.ts`.
- **CMake STUB vs REAL Modes:** Enforced Android-optimized ggml compilation flags (static libraries, CPU-only, OpenMP disabled) with toggleable `-DVELLUM_WHISPER_REAL=OFF` rollback capability.
- **App Links:** HTTPS intent filter includes `/oauth` path prefix in addition to `/api/cloud`.
- **CI:** Verifies Whisper source gate files; defaults APK builds to stub for reliability.

## [3.0.0-archive45] - 2026-09-30

Android SSO deep-link plumbing, native OS SpeechRecognizer wiring during audio recording, engine provenance badges, and OAuth cancel/timeout UX hardening.

### Added

- Deep-link OAuth return paths and Browser-based SSO flow hardening.
- Transcription recovery sheet and honesty gating for offline engines.
