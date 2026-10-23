# Priority status — v3.1.0

## Done on GitHub

| Item                                              | Status                         |
| ------------------------------------------------- | ------------------------------ |
| Dual-mode CMake / JNI / fail-closed stub          | Done                           |
| Vendored whisper.cpp + ggml on `main`             | Done (vendor-whisper workflow) |
| `setup:whisper` script + docs                     | Done                           |
| CI install (legacy-peer-deps) + source gate check | Done                           |
| APK workflow without obsolete SDK `tools`         | Done                           |
| App Links `/oauth` path                           | Done                           |
| Repo hygiene (test file, dual lockfile, README)   | Done                           |

## Still environment-dependent

| Item                | Notes                                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| Green CI `npm test` | Needs localStorage mock + honest orchestrator expectations                    |
| Green release APK   | R8/Tink `-dontwarn javax.annotation.**`; REAL NDK is slow                     |
| Device smoke test   | Install APK → Engine Ready → tiny model → offline transcript                  |
| Signed Play build   | Keystore secrets                                                              |
| Dependabot PRs      | Prefer patch bumps; **do not** merge TypeScript 7 without a dedicated upgrade |

## Mobile-friendly next steps

1. Actions → **Build Android APK** → Run workflow (`stub` for speed, `real` for Whisper).
2. Download the APK artifact on the phone when the job is green.
3. Merge low-risk Dependabot PRs after CI is green on `main`.
