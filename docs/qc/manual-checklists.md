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

## 7. CI (verified working 2026-10-21; all gates enforced)

Run verification via `~/.config/opencode/scripts/ci.sh run "<description>"`
(CI-first, guide §4 — never run the toolchain locally).

- [ ] CI run completes on Linux, Windows and macOS (baseline runs
      `39566612176` / `39574556505`, three OS runners green).
- [ ] Lint **denies warnings** (`--max-warnings=0`): burned down to **0** in
      slice B-7 (Q-005 resolved) — green on all three OS runners.
- [ ] Format check enforced (`prettier --check .`); baseline from slice B-3
      (D-407, Q-004 resolved).
- [ ] Orphan, typecheck, test and build steps all green on Linux, Windows
      and macOS.
- [ ] Security gates green: `secret scan` (gitleaks), `licence scan`
      (`check-licenses.mjs`), `sbom` (CycloneDX artefact), Dependency Audit.
- [ ] `CodeQL` findings triaged: any **new** alert is read and either fixed or
      recorded in `DECISIONS.md` — never silently ignored (D-409/D-410).
- [ ] Required checks in `.ci-required.txt` are exactly the ones deciding the
      verdict; a red non-required check is reported, not dropped.
- [ ] The Android workflow logs `VELLUM: <task> -> versionName=… versionCode=… signed=…`
      and currently reports `signed=false` until Q-002 is closed.
- [ ] Tagged releases fail loudly if no signing key is configured.
- [ ] Artifact `VellumScribe-Android-APKs-real` is attached to the run.
- [ ] Never claim a gate passed without inspecting the CI run output.

## 8. Accessibility smoke test (every user-visible slice; guide §21.6)

Automated a11y linting is a gate; these manual passes are the rest. Walk at
least the main flows (create note, record audio, open settings).

- [ ] **Keyboard only:** every control reachable in a logical order, with a
      visible focus indicator; no focus traps without a managed escape.
- [ ] **Screen reader** spot check (TalkBack on Android, or NVDA/VoiceOver on
      web): controls announce a name and role; dialogs announce on open and
      return focus on close; errors are announced.
- [ ] **200% zoom / narrow viewport:** content reflows without loss of
      information or horizontal scrolling of the main content.
- [ ] **High-contrast / colour-blind:** status is never conveyed by colour
      alone; contrast holds at WCAG AA on the app surfaces.
- [ ] **Reduced motion:** animations follow the OS "reduce motion" setting.
- [ ] **Target size:** touch targets are at least 24×24 CSS px.
- [ ] Captions/transcripts exist for any audio the slice introduces.
- [ ] Design review by the `designer` subagent passed on the **rendered**
      result (guide §27.8).

## 9. Legal checklist (every release; guide §2.5, §19)

- [ ] No third-party source, asset, or reverse-engineered material introduced;
      `docs/inspiration.md` rules respected.
- [ ] Every new dependency's licence classified (§19.2) and recorded in
      `ATTRIBUTION.md`; `licence scan` green.
- [ ] Every new **non-code** asset (icon, font, image, data) recorded in
      `ATTRIBUTION.md` with its licence; no NC/ND terms (§19.3).
- [ ] No trademarks, trade dress, or false affiliation claims in UI, docs or
      assets; brand marks are original (§27.5).
- [ ] No secrets in the diff, history, issues or PRs; `secret scan` clean
      (§20.1).
- [ ] Public research notes are summaries + URLs only, and human-gated
      (`docs/research/README.md`).
- [ ] Model/API terms used during the build recorded (`ATTRIBUTION.md`,
      §19.7); no redistributed model output.
- [ ] `LICENSE` present and unchanged (or the change is deliberate and
      recorded); inbound = outbound holds.
- [ ] Privacy: any new data collection is opt-in, disclosed, and gated.

## 10. Release checklist (guide §6.3, §25.1)

- [ ] `CHANGELOG.md` has a `## [x.y.z]` section with Summary, Added/Changed/
      Fixed, known limitations, and roadmap progress — honest, no false claims.
- [ ] `ROADMAP.md` readiness updated **only** from verified evidence.
- [ ] Version bumped in `package.json`; `versionCode` strictly increases.
- [ ] All required checks green on `main`; branch protection satisfied.
- [ ] Tag `v*.*.*` pushed: Release created with notes from `CHANGELOG.md`,
      APKs attached with `APK-SHA256SUMS.txt`.
- [ ] Accessibility smoke test passed (§8) and legal checklist passed (§9).
- [ ] Release notes say what does **not** work as plainly as what does.
