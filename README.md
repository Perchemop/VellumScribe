# VellumScribe

Offline-first notes for Android and web. Write, record, and organize under events.
Optional on-device Whisper transcription and optional cloud backup.

## Features

- Notes under events (not a flat dump)
- Text, checklists, voice, sketch, document scan
- Optional PIN lock
- On-device Whisper (Android REAL build) + live dictation fallback
- Optional encrypted backup (Google Drive, OneDrive, WebDAV)

## Dev

```bash
npm install --legacy-peer-deps
npm run dev
```

## Android APK

```bash
npm run setup:whisper   # vendors whisper.cpp for REAL builds
npm run build:spa && npx cap sync android
cd android && ./gradlew assembleRelease
```

GitHub Actions: **Build Android APK**

- Default: `whisper_mode=real`
- Use `stub` only for faster CI without full native Whisper

Uninstall any previous APK before installing a new native build.

## Scripts

| Command                               | Purpose                       |
| ------------------------------------- | ----------------------------- |
| `npm run dev`                         | Local dev                     |
| `npm run build:spa`                   | Web bundle                    |
| `npm run typecheck` / `lint` / `test` | Quality                       |
| `npm run setup:whisper`               | Vendor native Whisper sources |

## Docs

- `SECURITY.md` — locks & encryption
- `CLOUD_PROVIDER_SETUP.md` — OAuth / WebDAV
- `docs/KNOWN_LIMITATIONS.md` — platform limits

## License

MIT — see `LICENSE`.
