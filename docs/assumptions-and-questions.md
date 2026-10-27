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

- **A-001.** The primary user is Android-first. _Inferred from the platform
  decision and the APK build path, never stated explicitly._ If the web app is
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

### Quality debt

**Q-004. ✅ Resolved 2026-10-23 — format checking is enforced.**
_Was:_ `npm run format:check` reported 194 files that would be reformatted, so
enabling the gate would have made CI red; the `format` job ran
`continue-on-error`.
_Resolution:_ one mechanical `prettier --write .` pass (148 files, D-407), the
generated `cap sync` web bundle added to `.prettierignore`, and the job
promoted to a required gate (`format`) running `npm run format:check`.

**Q-005. ✅ Resolved 2026-10-23 — lint is clean at `--max-warnings=0`.**
Was: the guide §4 ceiling denied all 656 pre-existing warnings, so `npm run
verify` failed at `lint` and never reached `check:orphans` or the test suite.
Resolution: burned the whole set down (656 → 0) over slices B-4…B-7 — unused
vars, `AppLogger` routing, a11y/hook fixes, and typed rows at every SQLite and
AI boundary. `npm run verify` is now green on ubuntu/windows/macos (`1cbc192`),
including the 86-test suite and the orphan check. The only remaining red is the
deliberately non-blocking Prettier job (see Q-004).

**Q-008. ✅ Resolved 2026-10-21 — legacy one-shot CI workflows cleaned up.**
There were 19 permanent no-op stubs (`if: false` jobs named "(disabled)")
plus four push-triggered bots holding `contents: write`.
_Action taken:_ deleted all 19 stubs; removed the `push:` trigger from the
four bots so they now run on `workflow_dispatch` only. `vendor-whisper.yml`
was left alone — it is dispatch-only and is a legitimate vendor-fetch tool,
not a patch bot.
_Result:_ `.github/workflows/` went from 27 files to 8:
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

### Guide Part II §26 conflicts — decisions requested

These are the open questions the guide's Part II §26 raises and explicitly
**leaves to the human**. They are recorded here rather than resolved.

**Q-012. Branch protection: review vs. agent merge (guide §26.3, D-410).**
Branch protection on `main` is now enabled with the required status checks from
`.ci-required.txt`, no force-push, no deletion. It does **not** require a human
review approval, because D-410 delegated merge authority to the agent and the
agent cannot approve its own PR — requiring approval would deadlock the
workflow. If you want a human approval required as well, say so and the setting
changes; the agent's merges would then need you.

**Q-013. Local-test vs. no-heavy-work (guide §26.1).** `CONTRIBUTING.md`
documents the exact local test commands for contributors, and states that the
_maintainer's_ machine runs them only in CI because it is memory-constrained.
Confirm that is the wording you want publicly.

**Q-014. Repository visibility (guide §26.2).** The repository is public. That
is required for free unlimited Actions minutes and the public Releases /
update-check flow. Confirm keeping it public, with the secret-scan and
branch-protection gates now in place, rather than a private bootstrap phase.

**Q-015. Employer / IP check (guide §19.6).** Whether an employer's IP
agreement could claim rights over work related to the employer's business, or
made with employer resources, has **not** been checked. This is a human task;
note the result here or in `ATTRIBUTION.md`.

**Q-016. Two administrators / MFA (guide §20.1, §22.2).** A personal-account
repository has one owner. Guide §20.1 asks for MFA on every privileged account
and at least two administrators once the project is public (bus factor). Do you
want to add a second admin, or record the single-maintainer risk explicitly?

**Q-017. Licence expression (guide §26.6).** The project ships **MIT** (single,
not "MIT OR Apache-2.0"). `ATTRIBUTION.md` and the SBOM report MIT. Confirm
this is intentional (it is the safest default per §16), or adopt the dual
expression.

**Q-018. Metrics / launch (guide §23.5).** No usage or community metrics are
tracked. Confirm whether any should be, and whether a launch/announcement is
intended at all — the guide says popularity is optional.

**Q-019. Name conflict / trademark clearance (guide §18, §25.1).** "VellumScribe"
has not been checked against package registries (npm/PyPI) or the WIPO Global
Brand Database. The name is treated as immutable for technical reasons
(in-place APK updates), so this is a clearance check, not a rename decision.
A human/legal task — record the outcome in `docs/product-name.md`.

**Q-020. Corrections to the local `guide.md` (raised by the 2026-10-27 review,
owner-deferred).** Three spots in the local-only guide are inaccurate; agents
must not edit it, so they are recorded here for the owner:

1. The Part II provenance note (guide lines ~557–565) lists II.19–II.25 and
   II.27.1–II.27.11 as "missing", but those sections **are present**; only
   **II.26.2–II.26.5** are actually absent. The "reproduced word-for-word"
   claim therefore no longer matches the file.
2. The `II.26.1` status note says "VellumScribe does neither" — stale.
   `CONTRIBUTING.md` already documents the exact local commands (§"Running the
   checks locally") and names CI as authoritative for the maintainer's machine.
3. `II.20` ("Security-audit skill") is written for **Engram** specifically
   (`.engram.json`, "Engram desktop application", cargo-deny) inside a
   document presented as the generic multi-project edition; it should be
   generalised or clearly marked as the worked example.

Owner decision 2026-10-27: leave `guide.md` untouched; this record is
sufficient. No further action required from the agent.

---

## Resolved

**Q-021. ✅ Resolved 2026-10-27 — git identity rule narrowed to commits (guide
§II.26.7, option a).**
_Was:_ §5.5 required _every commit, pull request, merge and tag_ to be authored
as `VellumScribe Dev <dev@example.com>`, which GitHub cannot enforce for PRs or
merges — both follow the pushing account.
_Resolution:_ the enforceable half stands: every **commit** carries that
identity and `ci.sh` asserts it before pushing. Pull-request authorship and the
"merged by" line are stated plainly as following the pushing account
(`Perchemop`); no machine account is introduced. Recorded as D-423.

**Q-003. ✅ Resolved 2026-10-25 — assetlinks fingerprint filled in.**
_Was:_ `public/.well-known/assetlinks.json` held a placeholder fingerprint, so
HTTPS App Links and OAuth return showed a disambiguation dialog.
_Resolution:_ the real release keystore SHA-256 was written into
`assetlinks.json`
(`98:99:30:CF:…:97`, keystore from Q-002). Deployment still requires serving
`/.well-known/assetlinks.json` over HTTPS at `vellumscribe.app`.

**Q-002. ✅ Resolved 2026-10-24 — release keystore generated and CI signing
verified.**
_Was:_ no release keystore existed, so `assembleRelease` produced an unsigned
APK that could not replace an installed copy.
_Resolution:_ a release keystore was generated (`PKCS12`, alias `vellumscribe`,
valid to 2054) and the four CI secrets (`ANDROID_KEYSTORE_BASE64`,
`ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) were
set. The Build Android APK run `40129841250` logged
`VELLUM: assembleRelease -> versionName=3.1.0 versionCode=30100 signed=true`.
Keystore certificate SHA-256:
`98:99:30:CF:3B:2C:17:6C:8E:54:DE:C9:03:21:F9:80:D3:8D:58:8A:AB:E5:CC:9D:3A:1F:31:DD:9C:B3:7E:97`.
The keystore lives outside the repository and is backed up by the owner; see
`docs/RELEASE_KEYSTORE.md`. This also unblocks A-3 (update-in-place proof) and
Q-003 (assetlinks fingerprint).

**Q-001. ✅ Resolved 2026-10-21 — every GitHub Actions run failed before any
step started.**
_Was:_ all runs on `main` concluded in 2–4 s with `steps: []` and no logs,
which blocked the APK build and removed the primary verification signal.
_Cause:_ account/repo runner side (Actions spending limit / billing on a
private repo), not the code.
_Resolution:_ the repository is now public, and runs execute normally.
Evidence — CI `39566612176` (Linux + Windows + macOS green), Security
Scanning `39566612217` (green), Build Android APK `39566612127` (green,
artifact `VellumScribe-Android-APKs-real`). Recorded as fact F-007.

**Q-011. SQLite has no delete path for recordings or OCR scans.**
While typing `lib/storage.ts` (slice B-7a) three dead guards were removed —
`deleteRecording`, `deleteOcrScan` and `cleanOrphanedMedia` probed
`SqliteRepository` for methods that do not exist anywhere in the codebase, so
those branches were never taken. `StorageManager.deleteRecording()` /
`deleteOcrScan()` therefore only invalidate the in-memory cache, and
`cleanOrphanedMedia()` always reports `{ cleanedCount: 0 }` (real pruning lives
on `SqliteRepository.findOrphanMediaKeys()` / `removeOrphanMediaRecord()`, which
the storage dashboard already calls directly). Behaviour is unchanged, but the
rows stay in SQLite after a delete. **Decision needed:** add the missing
`SqliteRepository` deletes, or document the cascade/cleanup path as a known
limitation.
