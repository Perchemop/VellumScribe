# VellumScribe 2.8.0 — Real Cloud Synchronization

> **Correction (added in 2.9.0, 2026-08-27):** despite what this document
> claims below, the code actually wired into the shipped app at this
> version still simulated cloud sync (fake progress delays, no network
> calls in `triggerSync`), used a fabricated "1-click SSO" login that
> never contacted any provider, and stored a hardcoded placeholder email
> address as a default identity. A more honest, mostly-working
> implementation existed in unused duplicate files at the repository root
> that were never part of the actual Vite build - this document was
> apparently written to describe that orphaned code, not what was
> actually shipping. This was fixed for real in 2.9.0; see
> `CHANGELOG.md` and `CLOUD_PROVIDER_SETUP.md` for the current, accurate
> state. We're leaving the rest of this file as originally written below,
> for the record, rather than silently rewriting it.

## Cloud

- Replaced simulated cloud synchronization with real provider adapters.
- Google Drive: OAuth 2.0 + PKCE + `drive.file` + upload/read-back verification.
- Dropbox: OAuth 2.0 + PKCE + offline token refresh + upload/read-back verification.
- OneDrive: OAuth 2.0 + PKCE + AppFolder access + upload/read-back verification.
- Nextcloud: WebDAV app-password authentication + upload/read-back verification.
- OAuth state and tokens are stored using native secure storage on Android.
- Access tokens are refreshed when expiry is detected.
- Cloud accounts are only marked connected after real provider authentication succeeds.
- Sync telemetry now reports measured transfer sizes and durations.
- Failed provider operations remain failed; no fake success metrics are generated.

## Security

- OAuth client secrets are never embedded in the APK.
- PKCE is used for public/mobile OAuth clients.
- Android custom URL callbacks are handled by Capacitor App.
- Cloud credentials are removed from secure storage on disconnect.

## Release

- Added production signing support to GitHub Actions for APK and AAB.
- Added SHA-256 checksums.
- Added build-time cloud OAuth configuration variables.

## Provider availability

iCloud and generic S3 remain explicitly unsupported until a provider-specific production adapter is configured. They are not reported as connected or synchronized.

