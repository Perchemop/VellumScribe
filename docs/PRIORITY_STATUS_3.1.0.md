# Priority status — v3.1.0 (post vendor + remaining work)

## Completed on GitHub

| Priority | Status |
|----------|--------|
| Dual-mode CMake (STUB/REAL) | Done |
| Dual-mode JNI | Done |
| Fail-closed stub | Done |
| Vendor full whisper.cpp + ggml on `main` | Done (vendor-whisper workflow) |
| `npm run setup:whisper` / setup script | Done |
| CI verifies source gate files | Done |
| APK workflow stub vs real input | Done |
| Docs honesty (KNOWN_LIMITATIONS, setup) | Done |
| App Links `/oauth` path | Done |
| Recovery sheet / SSO Browser plumbing | Present in app code |
| OfflineAiPanel honesty gating | Present |

## Requires a build machine / device (not doable from chat alone)

| Priority | Action |
|----------|--------|
| REAL NDK APK | Run **Build Android APK** with `whisper_mode=real`, or local `./gradlew assembleRelease` |
| Device smoke test | Engine Ready → tiny model → airplane mode transcript |
| Signed Play release | Configure signing keystore secrets |
| Live SSO on device | Test Google/Microsoft Browser + deep link return |
| SpeechRecognizer offline packs | User installs system language data |

## How to finish offline Whisper (mobile-friendly)

1. GitHub → **Actions** → **Build Android APK** → **Run workflow** → `whisper_mode=real` (long).
2. Download the artifact APK when green.
3. Install on arm64 phone and run the smoke test.

For faster CI green builds use `whisper_mode=stub` (default).
