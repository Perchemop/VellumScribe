# Assumptions & Open Questions

Facts, assumptions and decisions are kept strictly separate, per the guide.
Anything here that becomes settled must move to `docs/scope.md`,
`docs/parity.md` or `DECISIONS.md`.

Last reviewed: 2026-10-21.

---

## Facts (directly supported)

- F-001. The local machine has ~2.7 GiB RAM and no JDK, Android SDK, NDK or
  CMake. The Android APK cannot be built locally; it is built in CI.
- F-002. All 46 direct dependencies (runtime + dev) are permissively licensed
  (MIT, ISC, Apache-2.0, BSD-2-Clause). See `ATTRIBUTION.md`.
- F-003. The vendored native engine (`whisper.cpp` + `ggml`) is MIT.
- F-004. `npm run verify` (typecheck + lint + orphan check + 86 tests) passes
  on the local machine.
- F-005. The native engine is dual-mode: REAL when the upstream tree is
  vendored, fail-closed stub otherwise.
- F-006. `versionCode` is derived from `package.json`
  (`major*10000 + minor*100 + patch`; `3.1.0` → `30100`) and CI confirms it:
  run `39566612127` logged `versionName=3.1.0 versionCode=30100`.
- F-007. GitHub Actions is operational (verified 2026-10-21): CI run
  `39566612176` green on Linux, Windows and macOS; Security Scanning run
  `39566612217` green; Android APK run `39566612127` green with artifact
  `VellumScribe-Android-APKs-real` (unsigned — see Q-002).

## Assumptions (unconfirmed — carry risk)

- **A-001.** The primary user is Android-first. *Inferred from the platform
  decision and the APK build path, never stated explicitly.* If the web app is
  actually the primary surface, priority between the two should be revisited.
- **A-002.** "Premium UI" means the existing dark, information-dense aesthetic
  (`#121215`, emerald accent, dense cards) is correct, rather than a
  redesign. No design brief exists.
- **A-003.** Cloud features stay optional and consent-gated, off by default,
  with the user supplying their own API key or provider account.
- **A-004.** `arm64-v8a`-only is an acceptable APK restriction for the target
  audience (see Q-009).

---

## Open questions

### Blocking

**Q-002. No release keystore exists yet.**
Signing is fully wired (`android/keystore.properties` or `VELLUM_*` env vars,
CI secrets), but no key has been generated. Until one is, `assembleRelease`
produces an unsigned APK that cannot be installed, and no installed copy can
ever be updated in place. *Action:* generate and back up the keystore per
`docs/BUILD_RELEASE.md` §1, then set the four CI secrets.

**Q-003. `public/.well-known/assetlinks.json` still holds the placeholder
fingerprint.**
HTTPS App Links (`https://vellumscribe.app/...`) and OAuth return therefore
show a disambiguation dialog. *Action:* fill in the release keystore SHA-256
from Q-002.

### Quality debt

**Q-004. Format checking is not enforced.**
`npm run format:check` reports **194 files** that would be reformatted
(measured 2026-10-21). Adding the gate now would make CI red. *Action:* run one
dedicated mechanical formatting slice, then enable `format:check` as a
required CI step.

**Q-005. Lint warnings stand at 656** against a `--max-warnings=700` ceiling
(re-measured 2026-10-21).
The guide prefers warnings denied. *Action:* burn the warnings down, then drop
the ceiling to 0.

**Q-008. ✅ Resolved 2026-10-21 — legacy one-shot CI workflows cleaned up.**
There were 19 permanent no-op stubs (`if: false` jobs named "(disabled)")
plus four push-triggered bots holding `contents: write`.
*Action taken:* deleted all 19 stubs; removed the `push:` trigger from the
four bots so they now run on `workflow_dispatch` only. `vendor-whisper.yml`
was left alone — it is dispatch-only and is a legitimate vendor-fetch tool,
not a patch bot.
*Result:* `.github/workflows/` went from 27 files to 8:
build-apk, ci, fix-ai-handlers, fix-settings-jsx, remove-orphans,
security-scan, ux-residual, vendor-whisper. No workflow now fires on `push`
except `build-apk.yml`, `ci.yml` and `security-scan.yml`.

### Scope decisions not yet made

**Q-006. ✅ Resolved 2026-10-21 — deferred to a later phase.**
Plugin marketplace / user-installable extensions. The owner decided this is
not in scope for this major version but is not permanently excluded: "plugin
can wait until later in the project". Recorded as **deferred** in
`docs/scope.md` (Inspired but not yet decided). Revisit in a later phase
before any architectural work that would be shaped by it.

**Q-007. ✅ Resolved 2026-10-21 — out of scope for this major version.**
Continuous cross-device sync (as distinct from the existing encrypted
backup-and-restore). Recorded in `docs/scope.md` (Explicitly out of scope).
Adding it later requires a scope change in that file plus a decision entry.

### Product decisions to confirm

**Q-009. Is `arm64-v8a`-only acceptable?** 32-bit-only (`armeabi-v7a`) and
x86 devices cannot install the APK. Keeps the APK small given the bundled
inference runtime. See `docs/KNOWN_LIMITATIONS.md` §8.

**Q-010. APK size appetite.** The `real` Whisper mode bundles a ~30 MB
quantised model into APK assets. Confirm this is acceptable for sideload
distribution, or whether `stub` should be the default.

---

## Resolved

**Q-001. ✅ Resolved 2026-10-21 — every GitHub Actions run failed before any
step started.**
*Was:* all runs on `main` concluded in 2–4 s with `steps: []` and no logs,
which blocked the APK build and removed the primary verification signal.
*Cause:* account/repo runner side (Actions spending limit / billing on a
private repo), not the code.
*Resolution:* the repository is now public, and runs execute normally.
Evidence — CI `39566612176` (Linux + Windows + macOS green), Security
Scanning `39566612217` (green), Build Android APK `39566612127` (green,
artifact `VellumScribe-Android-APKs-real`). Recorded as fact F-007.
