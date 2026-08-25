# VellumScribe 2.7.0 — Reliability & Android Hardening

## Major changes

- Native Android structured data now uses `@capacitor-community/sqlite` with one-time migration from the legacy localStorage collections.
- Note body/title autosave is debounced to avoid a storage write on every keystroke.
- Individual note edits are persisted as SQLite row updates rather than rewriting the entire notes collection.
- Android secrets use `@aparajita/capacitor-secure-storage`, backed by the platform secure storage/Android Keystore on native builds.
- PIN hashing now uses PBKDF2-HMAC-SHA-256 with 210,000 iterations; legacy SHA-256 hashes remain verifiable for migration.
- Fake/random checksums, sync timings and download counts were removed.
- AI OCR, transcription, meeting-summary and conflict-merge failures no longer generate fabricated user content.
- Cloud provider setup no longer falsely reports an authenticated connection; provider adapters must perform real authentication before a connection is marked active.
- Android cleartext traffic and mixed-content settings are disabled.
- Broad public filesystem permission requests were removed for app-private file workflows.
- Update checking now supports an optional `VITE_UPDATE_MANIFEST_URL` instead of simulating a network check.
- Android CI now validates TypeScript and produces release APK/AAB artifacts plus SHA-256 checksums.

## Important limitation

Live Google Drive/Dropbox/OneDrive/iCloud/Nextcloud/S3 synchronization is intentionally not marked as connected until a real provider OAuth/API adapter is supplied. The previous simulated cloud behaviour has been removed rather than preserved as a false success state.

## Build

Run `npm install`, then `npm run lint` and `npm run build`. For Android run `npm run cap:sync` followed by the release Gradle tasks.
