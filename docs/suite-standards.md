# Suite standards (guide.md §12.1) — how VellumScribe satisfies them

The local guide defines a small set of standards every suite app carries:
a crash-reporting path, an update check, a CI-managed token ledger, a subtle
bottom-right version affordance that opens a standard Release Notes popup, and
release artefacts a user can verify. Most of the guide's wording assumes the
Rust suite (shared `crates/…`), so this document records, for each standard,
**what this repository ships and where** — the non-Rust equivalent, stated
explicitly rather than left to inference. VellumScribe is a TypeScript web +
Capacitor application: it consumes **no Rust crates**, and no `crates/` tree
exists here by design.

| Suite standard (guide §12.1, §7)                                                                                                                                     | VellumScribe implementation                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Crash detection and bug reporting (`crates/crash-report`)                                                                                                            | **Non-Rust equivalent:** `src/components/ErrorBoundary.tsx` (error boundary) and `src/lib/crashReporter.ts` (redacted, consent-gated report; the user's own GitHub token, never an embedded bot token)                                                                                                                                                               | `src/lib/crashReporter.test.ts`; DECISIONS on consent-by-default                                     |
| Update check (`crates/update-check`, one updater instance per app)                                                                                                   | **Non-Rust equivalent:** `src/lib/appUpdateManager.ts` — semver comparison against a remote manifest, `PrivacyManager.assertNetworkAllowed` before any request, "no manifest configured" reported honestly rather than as "up to date"                                                                                                                               | `src/lib/appUpdateManager` unit tests; `ReleaseNotesModal` update action                             |
| Token metrics ledger `docs/tokens.json`, updated and committed by CI on each semver tag                                                                              | `docs/tokens.json` + `scripts/tokens-ledger.ts` (pure logic in `src/lib/tokenLedger.ts`) + the `token-ledger` job in `.github/workflows/release.yml`, which records the tag's figure and opens a **pull request** because `main` is branch-protected                                                                                                                 | `src/lib/tokenLedger.test.ts`; `release.yml` `workflow_dispatch` dry run (recorded in `PROGRESS.md`) |
| Release notes reference the ledger values                                                                                                                            | `release.yml` appends the `--print` section from the ledger CLI to the GitHub Release body                                                                                                                                                                                                                                                                           | `.github/workflows/release.yml`; `releaseNotesSection()` in `src/lib/tokenLedger.ts`                 |
| Version shown subtly **bottom-right**; clicking it opens the standard **Release Notes** popup (version history, per-release app usage, token metrics, Update button) | `src/components/VersionFootprint.tsx` (the affordance) and `src/components/ReleaseNotesModal.tsx` (the popup), wired in `src/App.tsx`                                                                                                                                                                                                                                | `src/components/releaseNotesContract.test.tsx`; `src/lib/releaseNotes.test.ts`                       |
| Verify signature + `SHA256SUMS.txt` before any in-app auto-update                                                                                                    | **Deliberate deviation, recorded:** there is **no in-app self-update**. The popup's Update action links to the GitHub Releases page (https-only, with a safe fallback) and the APK is installed over the running copy by the user; release assets ship with `SHA256SUMS.txt` and the APK is signed, and `docs/BUILD_RELEASE.md` §5 documents the manual verification | `docs/BUILD_RELEASE.md`; `resolveReleaseHref` tests in `src/lib/releaseNotes.test.ts`                |
| README screenshots refreshed at v1.0 and every major release                                                                                                         | Obligation recorded; current line is 3.1.1, so the first mandated refresh is the v1.0/major milestone                                                                                                                                                                                                                                                                | `README.md`; `ROADMAP.md`                                                                            |

## How each standard is proven

- **Unit/SSR tests** in `src/` are the primary evidence; the suite runs on
  Linux, Windows and macOS in CI.
- **Workflow behaviour** (the ledger PR, the release-body metrics section) runs
  on a semver tag. It is exercised without cutting a release through
  `workflow_dispatch`, which is a read-only dry run:

  ```bash
  gh workflow run "Release (tag)" \
    -f release_tokens=0 -f tag=3.1.1
  ```

  The dry run installs dependencies, validates `docs/tokens.json`, and prints
  the token-metrics section it would publish. It writes no file, opens no PR and
  never creates or edits a release.

- **Honesty rules.** A ledger value of `0` is rendered as "not measured"
  everywhere (UI and release notes), never as a measurement; per-release usage
  is shown only when the user's opt-in metrics switch is on, and the popup says
  so plainly when it is off.

## Deviations, recorded rather than hidden

1. **No shared Rust crates.** The guide's suite infrastructure section describes
   shared crates; this app reimplements the two capabilities it needs in
   TypeScript (table above) and consumes no `crates/` submodule.
2. **No in-app self-update.** A web/Capacitor app cannot replace its own APK
   from inside the web layer; the standard's verify-then-activate flow does not
   apply. Manual installation with published checksums is the equivalent, and
   `docs/KNOWN_LIMITATIONS.md` records it as a limitation, not a feature.
