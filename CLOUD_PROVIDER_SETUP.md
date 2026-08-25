# VellumScribe real cloud providers

VellumScribe 2.8 uses real provider APIs rather than simulated sync results.

## Supported in this release

- Google Drive — OAuth 2.0 + PKCE, `drive.file` scope
- Dropbox — OAuth 2.0 + PKCE, offline refresh tokens
- Microsoft OneDrive — OAuth 2.0 + PKCE, `Files.ReadWrite.AppFolder`
- Nextcloud — WebDAV app-password authentication and verified upload/download

## Not falsely advertised as connected

iCloud and generic S3 are not enabled as production sync providers yet. They remain visible only as unsupported/configuration entries until a provider-specific adapter is supplied.

## Android redirect URI

The default redirect URI is:

`com.vellumscribe.app://oauth/<provider>`

The Android App plugin must be included and the corresponding provider OAuth console must allow the exact redirect URI where the provider supports custom schemes.

## Build variables

Set these public client identifiers at build time:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_DROPBOX_APP_KEY`
- `VITE_MICROSOFT_CLIENT_ID`

Do **not** put provider client secrets into the APK. Mobile apps are public OAuth clients; use PKCE.

## Google Drive

Use the narrow `drive.file` scope. Configure the OAuth consent screen and client for the Android application. Google recommends the narrowest practical Drive scope and supports `drive.file` for app-created/selected files.

## Dropbox

Use the PKCE flow and enable offline access if background refresh is required. Do not embed a Dropbox app secret in the APK.

## Microsoft

Register the Android/public client and grant the delegated permissions required for OneDrive AppFolder access.

## Production signing

The repository workflow now supports release APK/AAB signing using GitHub Actions secrets. Required secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

For a production release, create the signing key outside the repository and store only the encrypted/base64 secret in GitHub Actions.

Optional redirect overrides can be supplied as `VITE_GOOGLE_REDIRECT_URI`, `VITE_DROPBOX_REDIRECT_URI`, and `VITE_MICROSOFT_REDIRECT_URI` when a provider requires a platform-specific redirect URI.
