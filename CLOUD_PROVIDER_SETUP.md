# Cloud backup provider setup

This document describes what actually happens today when you connect a
cloud backup provider in VellumScribe, and what it would take to go
further. It is kept in sync with the code in `src/lib/cloudProviders.ts`
and `src/components/CloudConnectModal.tsx` - if you change the behavior
there, please update this file in the same change.

## Current status (honest summary)

| Provider | Connect method | Upload/download | Status |
|---|---|---|---|
| Google Drive | Paste an existing OAuth access token | Real (Drive REST API) | Works if you supply a valid token |
| Dropbox | Paste an existing access token | Real (Dropbox REST API) | Works if you supply a valid token |
| OneDrive | Paste an existing access token | Real (Microsoft Graph API) | Works if you supply a valid token |
| Nextcloud / ownCloud | Server URL + username + app password | Real (WebDAV) | Fully self-contained, no external token needed |
| Amazon S3 / compatible | - | - | Not implemented. Disabled in the UI. |
| Apple iCloud Drive | - | - | Not implemented. Disabled in the UI. |

There is **no in-app 1-click OAuth login** for Google Drive, Dropbox, or
OneDrive yet. Connecting one of these means generating a token yourself
(see below) and pasting it into the "Connect" dialog, where it is verified
against the provider's real API before being saved. This is not a
limitation we're hiding: the connect dialog says so, and no fake success
state is ever shown for a credential that wasn't actually verified.

## Getting a token for Google Drive / Dropbox / OneDrive

These are short-lived developer/testing workflows, not something to hand
to an end user in a production distribution. They are meant for:
personal use, self-hosting, and as a stopgap while a real OAuth redirect
flow (see below) is implemented.

- **Google Drive**: Use the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
  with the `https://www.googleapis.com/auth/drive.file` scope, or register
  your own OAuth client and run the authorization flow yourself. Paste the
  resulting access token into VellumScribe. Access tokens expire (usually
  in an hour); you'll need to refresh/reconnect periodically.
- **Dropbox**: In the [Dropbox App Console](https://www.dropbox.com/developers/apps),
  open your app, and under "OAuth 2" click "Generate access token". Paste
  it into VellumScribe.
- **OneDrive**: Use [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
  signed in with the account you want to use, or register your own Azure
  AD app with `Files.ReadWrite` scope. Paste the resulting access token
  into VellumScribe.

## Nextcloud / ownCloud (fully working, no token needed)

1. In your Nextcloud web UI: **Settings -> Security -> Devices & sessions**.
2. Create a new app password, name it "VellumScribe".
3. In VellumScribe's Connect dialog, enter your server URL (e.g.
   `https://cloud.example.com`), your Nextcloud username, and the app
   password you just generated. The native Android build only allows
   HTTPS (cleartext HTTP traffic is disabled in `capacitor.config.json`
   for security) - use a plain HTTP server URL only when testing the web
   build.
4. VellumScribe verifies this against `GET /ocs/v1.php/cloud/user` before
   marking the account connected, and uses plain WebDAV
   (`/remote.php/dav/files/<user>/...`) to upload/download the backup file.
   Make sure the backup folder (`VellumScribe` by default, configurable in
   the connect dialog's "Backup folder" section) already exists on the
   server, since WebDAV PUT does not create missing parent directories.

## Implementing real 1-click OAuth login (open contribution)

`src/lib/cloudProviders.ts` already has a real, working PKCE
implementation - `getAuthUrl()`, `exchangeCodeForToken()`, and
`generatePkcePair()` - that is simply not wired to a UI flow yet. To
finish this:

1. Register an OAuth app with each provider you want to support and set
   `VITE_GOOGLE_DRIVE_CLIENT_ID`, `VITE_DROPBOX_CLIENT_ID`, and/or
   `VITE_ONEDRIVE_CLIENT_ID` (see `.env.example`).
2. Add a route/page that receives the OAuth redirect (the default
   `redirectUri` in `OAUTH_CONFIGS` is `<origin>/oauth/callback`) and calls
   `CloudProviderService.exchangeCodeForToken()` with the `code` and
   `state` query params plus the PKCE verifier stashed in
   `sessionStorage` by `getAuthUrl()`.
3. Wire a button in `CloudConnectModal.tsx` to call `getAuthUrl()` and
   redirect the browser there, then call `CloudSyncEngine.connectAccount()`
   with the real profile info once the callback completes.
4. Please keep the same honesty policy the rest of this module follows:
   never mark an account "connected" without a real, verified credential,
   and never report a sync as successful when nothing was actually
   uploaded.

## What "sync" actually does today

`CloudSyncEngine.triggerSync()` (in `src/lib/cloudSync.ts`) exports the
notes flagged for cloud save into a single JSON snapshot and uploads it
to every connected, real account via `CloudProviderService.uploadBackup()`.
There is no delta sync, no background daemon, and no per-note remote
diffing - each sync uploads the current full snapshot to a fixed filename
(`vellumscribe_backup.json`) in the configured backup folder, and only
reports success for the providers where the upload actually succeeded.
