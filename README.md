# VellumScribe

VellumScribe is an offline-first, event-based note-taking app. Notes are
organized under events (meetings, lectures, interviews, sprints…) rather
than a flat list, and each note can hold rich text, a checklist, a
hand-drawn sketch, a voice memo, or an OCR-scanned photo. It ships as a
web app and as an Android app (via Capacitor).

This README describes what the app does today. For release history and
audit notes, see [`CHANGELOG.md`](./CHANGELOG.md) and
[`docs/history/AUDIT.md`](./docs/history/AUDIT.md).

## Features

- **Event-based organization** — notes live under events, with recents and an archive.
- **Rich note types** — markdown, checklists, sketch canvas, voice memos, OCR scans.
- **Protected notes (PIN & passphrase)** — Standard or Private lock with AES-256-GCM; see [`SECURITY.md`](./SECURITY.md).
- **Local version history** — snapshots with SHA-256 checksums.
- **Optional AI (Google Gemini)** — OCR, transcription, summaries; requires a key or features fail closed.
- **On-device Whisper (Android)** — dual-mode native build (REAL upstream whisper.cpp + ggml, or fail-closed STUB).
- **Encrypted cloud backup** — Drive, OneDrive, WebDAV; encrypt-on-device before upload.
- **Offline-first** — SQLite + media store; works without a network.

## Getting started

Requires **Node.js 20+** and **npm 10+**.

```bash
npm install --legacy-peer-deps   # see .npmrc (eslint 10 / jsx-a11y peer range)
cp .env.example .env             # optional: GEMINI_API_KEY for server-side AI
npm run dev
```

### Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Local dev (Express + Vite) |
| `npm run build` | Production SPA + server bundle |
| `npm run build:spa` | SPA only |
| `npm start` | Production server (after `build`) |
| `npm run typecheck` / `lint` / `test` | Quality gates |
| `npm run verify` | typecheck + lint + orphans + test |
| `npm run setup:whisper` | Vendor upstream whisper.cpp + ggml for REAL native builds |
| `npm run cap:sync` / `cap:open` | Capacitor Android sync / Android Studio |

## Android build

```bash
npm run setup:whisper            # once (or use Actions → Vendor Whisper upstream)
npm run build:spa
npm run cap:sync
cd android && ./gradlew assembleRelease
```

- **REAL** offline Whisper: CMake detects `third_party/whisper.cpp/src/whisper.cpp` and `ggml/src/ggml.c`.
- **STUB**: fail-closed (`inferenceRuntimeReady=false`) if sources are missing or `-DVELLUM_WHISPER_REAL=OFF`.

CI: `.github/workflows/build-apk.yml` (workflow_dispatch: `whisper_mode=stub|real`).

Details: [`docs/GITHUB_WHISPER_SETUP.md`](./docs/GITHUB_WHISPER_SETUP.md), [`docs/KNOWN_LIMITATIONS.md`](./docs/KNOWN_LIMITATIONS.md).

## Project structure

```
src/            React UI, services, storage, crypto
android/        Capacitor Android + NDK Whisper JNI
server.ts       Express SPA host + Gemini proxy
docs/           Architecture, release, offline AI notes
scripts/        setup-whisper, orphan checks
```

## Known limitations

- OAuth for Drive/OneDrive needs app credentials — see `CLOUD_PROVIDER_SETUP.md`.
- Short numeric PINs are weaker than passphrases; prefer Private Lock for sensitive notes.
- Offline OS speech may need system language packs on some OEMs.
- Full offline Whisper needs a REAL NDK build + on-device model download.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](./LICENSE).
