# VellumScribe

**Private, offline-first notes for Android and the web.** Write, record,
scan and sketch — organised under the events of your life, stored on your own
device.

VellumScribe is a notebook for meetings, lectures, interviews and ideas at
2am. Everything is saved locally in SQLite; nothing is uploaded unless you
explicitly turn on a cloud provider or an AI service. It is built for one
person who wants a good notes app without handing over everything they write.

- **Not** a collaboration platform or team wiki.
- **Not** a service that syncs your notes behind your back.
- A copy of no commercial product: the design, model and interaction are
  original (see [`docs/inspiration.md`](docs/inspiration.md)).

## What it does

- **Notes under events, not a flat dump** — a meeting, a lecture, a trip; notes
  hang under the event they belong to.
- **Many ways to capture** — text, checklists, voice recordings, sketches, and
  document/handwriting scans.
- **On-device transcription** — optional native Whisper (Android REAL build)
  with a live-dictation fallback; recordings carry transcripts so nothing
  depends on being able to hear them.
- **Versioned, recoverable** — revision history and a trash, so a delete is not
  a data loss.
- **Optional PIN lock** — masks sensitive content in the UI until unlocked.
- **Optional, consent-gated cloud** — encrypted backup to Google Drive,
  OneDrive or WebDAV; BYOK AI providers. Off by default.

See [`docs/scope.md`](docs/scope.md) for what is in and out of scope, and
[`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for current limits
(for example: release APKs are not yet signed — see [`ROADMAP.md`](ROADMAP.md)).

## Getting started

Requires **Node.js 22+**.

```bash
git clone https://github.com/Perchemop/VellumScribe.git
cd VellumScribe
npm install --legacy-peer-deps
cp .env.example .env      # optional; only needed for cloud/AI features
npm run dev
```

The development server prints the local URL to open in your browser.

### Android

The Android build needs the Android SDK/NDK and CMake, so it runs in CI here.
To build an APK yourself:

```bash
npm run setup:whisper          # vendors whisper.cpp for REAL native inference
npm run build:spa && npx cap sync android
cd android && ./gradlew assembleRelease
```

Install from the **Build Android APK** workflow artefact, or build the APK
locally as above. Uninstall any previous APK before installing a different
native build mode. Full details are in
[`docs/BUILD_RELEASE.md`](docs/BUILD_RELEASE.md).

## Where to get help

- **Questions and bugs:** open an [issue](https://github.com/Perchemop/VellumScribe/issues/new/choose)
  — pick the template that fits.
- **Accessibility problems:** use the _Accessibility issue_ template; they are
  treated as time-sensitive. Read [`ACCESSIBILITY.md`](ACCESSIBILITY.md).
- **Security vulnerabilities:** report **privately**, never in a public issue —
  read [`SECURITY.md`](SECURITY.md).
- **Platform limits and known issues:** [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).

## Contributing

Contributions are welcome, and there are low-skill-barrier paths: docs, tests,
and translations as well as code.

- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to set up the environment,
  run the tests, and what review expects.
- Read [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for the standards we hold
  each other to.
- Project governance, including who decides what, is in
  [`GOVERNANCE.md`](GOVERNANCE.md); the project's goals are in
  [`VISION.md`](VISION.md).
- The plan and current progress are in [`ROADMAP.md`](ROADMAP.md) and
  [`CHANGELOG.md`](CHANGELOG.md).

The one rule that matters most: **never make a feature look like it works when
it doesn't.** A feature that is not ready must say so, loudly and honestly.

## Quality

Every change is verified in GitHub Actions (Linux, Windows and macOS), which
runs:

| Gate                                    | Command                                        |
| --------------------------------------- | ---------------------------------------------- |
| Formatting                              | `npm run format:check`                         |
| Type checking                           | `npm run typecheck`                            |
| Linting (warnings denied)               | `npm run lint`                                 |
| Dead-file check                         | `npm run check:orphans`                        |
| Tests (Vitest)                          | `npm run test`                                 |
| Production build                        | `npm run build`                                |
| Secret scan, licence scan, SBOM, CodeQL | see [`.github/workflows/`](.github/workflows/) |

## Licence

MIT — see [`LICENSE`](LICENSE). Third-party components and assets, with their
licences, are listed in [`ATTRIBUTION.md`](ATTRIBUTION.md).
