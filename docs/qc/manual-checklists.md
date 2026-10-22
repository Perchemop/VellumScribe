# Manual QC Checklists

Walk these by hand for every slice. Automation cannot prove these things.
Tick only what you actually observed — never pre-tick.

Record the result of each pass in `PROGRESS.md`.

---

## 1. Slice-level (walk per slice)

- [ ] The slice's acceptance criteria in `IMPLEMENTATION_PLAN.md` are met.
- [ ] CI is green via `~/.config/opencode/scripts/ci.sh run "<description>"`
      (typecheck, lint with warnings denied, orphan check, tests, build on
      Linux/Windows/macOS). Never claim a gate passed without inspecting the
      CI run output.
- [ ] New behaviour has at least one test that fails without the change.
- [ ] `REQUIREMENTS_TRACEABILITY.md` updated (requirement → file → test).
- [ ] No new orphaned files (`npm run check:orphans`).
- [ ] No debug logging, temporary branches or commented-out code left.
- [ ] No secrets, keys or tokens added (re-run the secret scan before push).
- [ ] Existing flows you did not intend to touch still work (smoke the
      editor, the recorder and settings).

## 2. Definition of Done

- [ ] Works, or is intentionally disabled with an explanation visible to the
      user. **No fake success state.**
- [ ] Accessibility: keyboard reachable, readable at default zoom, contrast
      holds on `#121215`.
- [ ] Performance: no regression in bundle size (see the `dist` output line
      in `npm run build`) and no blocking work on startup.
- [ ] Cross-browser / cross-platform: verified on the target surfaces for
      this slice (Android WebView, Chromium-based browser; Firefox if UI).
- [ ] Written documentation updated (`CHANGELOG.md` for user-visible change,
      `docs/` where behaviour or limits changed).
- [ ] Orchestrator sign-off recorded in `PROGRESS.md`.

## 3. Audio & transcription

- [ ] Record → stop → transcription produces text, or fails loudly with the
      recovery sheet. Never silence.
- [ ] Kill the app mid-transcription, relaunch: it resumes from a checkpoint
      instead of restarting.
- [ ] Import a > 500 MB file and a > 30 min file: the limit is announced,
      not silent (`docs/KNOWN_LIMITATIONS.md` §7).
- [ ] Engine provenance badge shows the real engine, not a placeholder.
- [ ] Microphone permission denied: the UI explains and offers next steps.

## 4. Security

- [ ] Cold start with a PIN set: nothing sensitive is readable in the UI
      before unlock.
- [ ] Wrong PIN: clear failure, no hint about the stored hash.
- [ ] `lock_mode = private` masks metadata in list views too.
- [ ] Cached data on disk is ciphertext after app restart.
- [ ] Cloud consent toggle genuinely gates network calls (no call is made
      when the toggle is off).
- [ ] `npm run verify` crypto tests still pass (PBKDF2 @ 600k iterations).

## 5. Android release & update-in-place

- [ ] `package.json` version bumped; `versionCode` derived and **greater**
      than the currently installed build.
- [ ] Release APK signed with the **same key** as the installed app
      (`docs/BUILD_RELEASE.md` §5 signature comparison).
- [ ] Install the new APK over the existing install: no
      `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, no `INSTALL_FAILED_VERSION_DOWNGRADE`.
- [ ] App data survives the update (notes, recordings, PIN all intact).
- [ ] Launcher icon, round icon and splash all show the white "V" brand mark
      on `#09090B`.
- [ ] `adb shell dumpsys package com.vellumscribe.app` reports the expected
      `versionCode` / `versionName`.

## 6. Packaging & brand

- [ ] `npm run assets:brand` produces no diff (assets are in sync).
- [ ] PWA `manifest.json` background matches the launcher background
      (`#09090B`).
- [ ] Favicon, PWA icon and Android launcher icon are the same mark.
- [ ] Production build succeeds via CI (`ci.sh`); `dist/` has an `index.html`
      with hashed assets. (`npm run build` is CI-only — guide §4.)

## 7. CI (verified working 2026-10-21; lint gate now denied-warnings)

Run verification via `~/.config/opencode/scripts/ci.sh run "<description>"`
(CI-first, guide §4 — never run the toolchain locally).

- [ ] CI run completes on Linux, Windows and macOS (baseline runs
      `39566612176` / `39574556505`, three OS runners green).
- [ ] Lint **denies warnings** (`--max-warnings=0`): currently FAILING on 656
      pre-existing warnings — active blocker Q-005; burn down in slices of ≤50
      until lint passes on all three OS runners.
- [ ] Orphan, typecheck, test and build steps all green on Linux, Windows
      and macOS.
- [ ] The staged format job is allowed to fail without failing the workflow
      (Q-004) — confirm the workflow conclusion is still `success` while format
      is non-blocking.
- [ ] The Android workflow logs `VELLUM: <task> -> versionName=… versionCode=…
      signed=…` and currently reports `signed=false` until Q-002 is closed.
- [ ] Tagged releases fail loudly if no signing key is configured.
- [ ] Artifact `VellumScribe-Android-APKs-real` is attached to the run.
- [ ] Never claim a gate passed without inspecting the CI run output.
