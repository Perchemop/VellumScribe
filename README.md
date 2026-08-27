# VellumScribe

VellumScribe is an offline-first, event-based note-taking app. Notes are
organized under events (meetings, lectures, interviews, sprints...) rather
than a flat list, and each note can hold rich text, a checklist, a
hand-drawn sketch, a voice memo, or an OCR-scanned photo. It ships as a
web app and as an Android app (via Capacitor).

This README describes what the app actually does today. If you're
looking for a warts-and-all account of what was fixed to get it to this
state, see [`AUDIT.md`](./AUDIT.md) and [`CHANGELOG.md`](./CHANGELOG.md).

## Features

- **Event-based organization** - notes live under events, with a
  dedicated recents view and an archive for completed events.
- **Rich note types** - plain text/markdown, interactive checklists, a
  sketch canvas, voice memos with playback, and OCR-scanned handwritten
  notes.
- **PIN-protected notes** - lock individual notes with a PIN. Locked note
  content (body, checklist, sketch) is encrypted with AES-256-GCM, key
  derived via PBKDF2-HMAC-SHA-256 (210,000 iterations). See
  [`SECURITY.md`](./SECURITY.md) for the honest threat model, including
  why a short numeric PIN is not a strong secret on its own.
- **Local version history** - automatic snapshots of note edits, each
  with a real SHA-256 checksum of the content.
- **Optional AI assistance (Google Gemini)** - OCR text extraction, audio
  transcription, meeting-minutes summarization, and AI-assisted 3-way
  merge for conflicting edits. Requires a Gemini API key (server-side env
  var or your own key pasted into Settings); without one, these features
  say so plainly rather than inventing plausible-looking content.
- **Cloud backup** - export a JSON snapshot of cloud-enabled notes to
  Google Drive, Dropbox, OneDrive, or a self-hosted Nextcloud/ownCloud
  server. See [`CLOUD_PROVIDER_SETUP.md`](./CLOUD_PROVIDER_SETUP.md) for
  exactly how connecting each provider works today (there is no 1-click
  OAuth login yet - see that file for what "connect" currently means and
  what it would take to add one).
- **Export** - JSON backup and Markdown archive export, from Settings.
- **Offline-first** - the app is fully usable with no network connection;
  all data lives in the browser's local storage on this device.

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY if you want server-side AI features
npm run dev
```

This starts the Express server (`server.ts`, via `tsx`) which serves the
Vite dev build and proxies AI requests to Gemini. Open the printed
localhost URL.

### Other scripts

| Script | What it does |
|---|---|
| `npm run dev` | Local dev server (Express + Vite) |
| `npm run build` | Production build: Vite SPA bundle + bundled server |
| `npm run build:spa` | Just the Vite SPA bundle, no server |
| `npm start` | Run the production server build (after `npm run build`) |
| `npm run preview` | Preview the built SPA with Vite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, writes changes |
| `npm run test` | Vitest, single run |
| `npm run verify` | typecheck + lint + test, useful before opening a PR |
| `npm run cap:sync` | Sync web build into the Android Capacitor project |
| `npm run cap:open` | Open the Android project in Android Studio |

## Android build

This project uses [Capacitor](https://capacitorjs.com/) to wrap the web
app as a native Android app.

```bash
npm run build:spa
npm run cap:sync
npm run cap:open   # opens Android Studio
```

See `.github/workflows/build-apk.yml` for the CI build. It currently
produces a debug-signed APK; see that file's comments for what's needed
to produce a properly signed release build.

## Project structure

```
src/
  components/   React components (one file per modal/view, mostly)
  context/      AppContext - top-level app state and data-loading hooks
  lib/          Core logic: storage, crypto, cloud sync, AI service, etc.
  types.ts      Shared TypeScript types for all data records
server.ts       Express server: serves the SPA, proxies Gemini AI calls
```

Storage is plain browser `localStorage` (see `src/lib/storage.ts`) -
there is no SQLite or IndexedDB involved, despite some older internal
naming (`SQLiteDatabase` is just an alias for the storage class). This is
a known scaling limitation; see `AUDIT.md`.

## Known limitations

- **No 1-click cloud login yet.** Connecting Google Drive/Dropbox/OneDrive
  currently means pasting a token you generated yourself. Nextcloud is
  fully self-contained (server URL + username + app password). See
  `CLOUD_PROVIDER_SETUP.md`.
- **iCloud and S3 backends are not implemented.** They're disabled in the
  UI rather than faked.
- **Storage is `localStorage`**, which has a small per-origin size quota
  (typically 5-10MB depending on the browser). Heavy use of audio
  recordings or sketches can hit this. Migrating to IndexedDB or a real
  embedded database is a good, fairly large, contribution.
- **A short numeric PIN is inherently low-entropy.** PBKDF2 slows down
  brute-forcing but can't fix a 4-6 digit keyspace. See `SECURITY.md`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT - see [`LICENSE`](./LICENSE).
