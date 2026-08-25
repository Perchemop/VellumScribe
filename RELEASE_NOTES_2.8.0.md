# VellumScribe 2.8.0 — Real Cloud Synchronization

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
