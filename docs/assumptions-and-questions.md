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
  (`major*10000 + minor*100 + patch`; `3.1.0` → `30100`).

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

**Q-001. Every GitHub Actions run fails before any step starts.**
All runs on `main` (CI, Security Scanning, Build Android APK) conclude in
2–4 s with `steps: []` and no logs. This blocks the APK build entirely and
removes the guide's primary verification signal. Points at the account/repo
runner side — Actions spending limit, billing or runner allocation — not at
the code. *Action:* check **Settings → Billing → Actions**, then re-run a
workflow and confirm it gets past "Set up job". Making the repository public
should also restore free Actions minutes.

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

**Q-005. Lint warnings stand at 664** against a `--max-warnings=700` ceiling.
The guide prefers warnings denied. *Action:* burn the warnings down, then drop
the ceiling to 0.

**Q-008. Legacy one-shot CI workflows remain in `.github/workflows/`.**
15 are permanent no-op stubs (`patch-*.yml`, `restore-*.yml`, `ux-*.yml`,
`fix-settings-*.yml`, `remove-*.yml`), and four push-triggered bots hold
`contents: write` and auto-commit to `main` (`fix-ai-handlers.yml`,
`fix-settings-jsx.yml`, `remove-orphans.yml`, `ux-residual.yml`).
*Action pending owner approval:* delete the no-ops and restrict the bots to
`workflow_dispatch`.

### Scope decisions not yet made

**Q-006. Plugin marketplace / user-installable extensions — in or out?**
Inspired by Obsidian's public behaviour but deliberately left undecided in
`docs/scope.md`. Needs an explicit decision.

**Q-007. Continuous cross-device sync — in or out?**
The app has backup-and-restore. Continuous sync (conflict resolution,
presence of multiple devices) is a different feature and was not selected as
out of scope. Needs an explicit decision.

### Product decisions to confirm

**Q-009. Is `arm64-v8a`-only acceptable?** 32-bit-only (`armeabi-v7a`) and
x86 devices cannot install the APK. Keeps the APK small given the bundled
inference runtime. See `docs/KNOWN_LIMITATIONS.md` §8.

**Q-010. APK size appetite.** The `real` Whisper mode bundles a ~30 MB
quantised model into APK assets. Confirm this is acceptable for sideload
distribution, or whether `stub` should be the default.
