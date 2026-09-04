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
- **Protected notes (PIN & Passphrase)** - lock individual notes with a
  numeric PIN or an arbitrary passphrase. Choose between **Standard Lock**
  (encrypts note body, checklist, and sketch while keeping title and tags
  visible for navigation) and **Private Lock** (encrypts title, tags, and
  body into the AES-256-GCM envelope; masks title as "🔒 Locked Note" in
  all list views to prevent metadata and topic leakage). Keys derived via
  PBKDF2-HMAC-SHA-256 (210,000 iterations). See [`SECURITY.md`](./SECURITY.md)
  for details on the threat model.
- **Local version history** - automatic snapshots of note edits, each
  with a real SHA-256 checksum of the content.
- **Optional AI assistance (Google Gemini)** - OCR text extraction, audio
  transcription, meeting-minutes summarization, and AI-assisted 3-way
  merge for conflicting edits. Requires a Gemini API key (server-side env
  var or your own key pasted into Settings); without one, these features
  say so plainly rather than inventing plausible-looking content.
- **Encrypted cloud backup** - export compressed, encrypted snapshot archives
  (`vellumscribe_backup.json.gz`) with SHA-256 integrity checksums to
  Google Drive, Microsoft OneDrive, Nextcloud (WebDAV), standard WebDAV, or
  the dedicated Encrypted Cloud Vault. All backups are encrypted on-device
  using AES-256-GCM before transport.
- **Safe import & export** - multi-phase import pipeline (Format Validation →
  Version Check → Entity Preview → Safety Snapshot → Transactional Import →
  Integrity Check) preventing accidental data corruption or overwrites.
- **Offline-first architecture** - full functionality with no network
  connection required; all relational data lives in an embedded SQLite
  database on the local device.

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

## Storage architecture
 
VellumScribe employs a dual-tiered, offline-first storage architecture designed for data integrity, low latency, and crash resilience:
 
- **Embedded relational database (`sql.js` WebAssembly)**: Core relational models (events, notes, checklists, transcripts, version history snapshots) live in an in-memory SQLite database supporting ACID transactions, complex queries, and relational indexing.
- **Durable persistence**:
  - **Web (Browsers)**: SQLite database snapshots are persisted to IndexedDB using `idb-keyval` as a serialized binary blob (`sqlite_db`).
  - **Android (Native)**: SQLite database files are written directly to native app storage (`vellumscribe.db`) via the Capacitor Filesystem plugin.
- **Dual-database crash recovery**: A shadow backup snapshot (`vellumscribe_backup.db`) is maintained alongside the primary database. On startup, SQLite integrity checks are executed; if corruption is detected, auto-recovery restores the last valid snapshot.
- **Out-of-band binary media store**: Heavy binary assets (voice audio memos, OCR camera scans, and freehand sketches) are stored outside the SQLite table space via `MediaRepository` and `SecureMediaRepository` (IndexedDB blobs on web, discrete filesystem files on native), preventing database bloat and keeping SQLite operations rapid.
- **Automatic legacy migration**: Any legacy `localStorage` keys from earlier versions are automatically migrated into the SQLite schema on startup, after which plaintext legacy keys are pruned.
 
## Known limitations
 
- **OAuth setup requirements**: Connecting Google Drive, Microsoft OneDrive, or WebDAV services requires authorization tokens or app passwords. See `CLOUD_PROVIDER_SETUP.md` for connection specifics.
- **iCloud and S3 backends are not implemented**: They are not present in the active UI to avoid misleading placeholders.
- **PIN vs Passphrase entropy**: A 4-to-6 digit numeric PIN has a low keyspace. While PBKDF2-HMAC-SHA-256 with 210,000 iterations slows down attacks, an attacker with physical or offline access can brute-force a short numeric PIN. For sensitive notes, choose **Passphrase** and **Private Lock** mode. See `SECURITY.md`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT - see [`LICENSE`](./LICENSE).
